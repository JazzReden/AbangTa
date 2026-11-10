import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { RoomService } from '@/services/properties/room.service';
import { RoomShareService } from '@/services/tenants/room-share.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { BillingService } from '@/services/billing/billing.service';
import { PaymentService } from '@/services/billing/payment.service';
import { ReceiptService } from '@/services/billing/receipt.service';
import { parseInvitationInput } from '@/lib/utils/invitation-input';
import { philippineDate } from '@/lib/utils/philippine-dates';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Individual beds and monthly tenant billing', () => {
  const marker = 'beds-' + randomUUID();
  let owner: string, stranger: string, propertyId: string, roomId: string;
  let users: string[] = [], beds: string[] = [];
  beforeAll(() => loadEnvConfig(process.cwd()));
  beforeEach(async () => {
    users = [];
    for (let i = 0; i < 6; i++) users.push((await prisma.user.create({ data: { name: marker + i, role: i < 2 ? 'LANDLORD' : 'TENANT', passwordHash: 'fixture-only' } })).id);
    [owner, stranger] = users;
    propertyId = (await prisma.property.create({ data: { name: marker, address: 'Isolated test only', landlordId: owner,
      utilityConfigs: { create: [{ utilityType: 'WATER', billingMethod: 'INCLUDED' }, { utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' }] },
      billingCharges: { create: [{ itemType: 'WIFI', treatment: 'ADDITIONAL', amount: 200.25 }, { itemType: 'PARKING', treatment: 'ADDITIONAL', amount: 500 }] },
    } })).id;
    roomId = (await RoomService.create(propertyId, owner, { roomNumber: '101', capacity: 2, monthlyRent: 2000, rentalMode: 'PER_BED' })).id;
    beds = (await prisma.bed.findMany({ where: { roomId }, orderBy: { label: 'asc' } })).map(bed => bed.id);
    await RoomService.saveBed(roomId, owner, beds[1], { label: 'Upper bunk', monthlyRent: 2500.50, status: 'VACANT' });
  });
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { tenancy: { propertyId } } });
    await prisma.bill.deleteMany({ where: { propertyId } });
    await prisma.utilityShare.deleteMany({ where: { tenancy: { propertyId } } });
    await prisma.utilityAllocation.deleteMany({ where: { config: { propertyId } } });
    await prisma.meterReading.deleteMany({ where: { propertyId } });
    await prisma.roomAccessRequest.deleteMany({ where: { room: { propertyId } } });
    await prisma.tenancy.deleteMany({ where: { propertyId } });
    await prisma.room.deleteMany({ where: { propertyId } });
    await prisma.utilityConfig.deleteMany({ where: { propertyId } });
    await prisma.property.delete({ where: { id: propertyId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => prisma.$disconnect());

  async function request(index: number) {
    return prisma.roomAccessRequest.create({ data: { roomId, userId: users[index] } });
  }
  async function assign(index: number, bed = beds[0]) {
    const row = await request(index);
    await RoomShareService.review(row.id, owner, true, bed);
    const tenancy = await prisma.tenancy.findFirstOrThrow({ where: { tenantId: users[index], status: 'ACTIVE' } });
    return prisma.tenancy.update({ where: { id: tenancy.id }, data: { startDate: philippineDate('2030-01-01') } });
  }
  function bill(tenancyId: string, month = '2030-01', extras: object = {}) {
    return BillingService.generateMonthlyBill({ tenancyId, createdById: owner, billingPeriodStart: philippineDate(month + '-01'), billingPeriodEnd: philippineDate(month + '-31', true), dueDate: philippineDate(month + '-31', true), ...extras }, owner);
  }

  test('creates named beds with independent rates and no destructive legacy migration', async () => {
    expect(beds).toHaveLength(2);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: beds[1] } })).monthlyRent.toFixed(2)).toBe('2500.50');
    const legacy = await prisma.room.create({ data: { propertyId, roomNumber: 'legacy', capacity: 3, monthlyRent: 900 } });
    expect(legacy.rentalMode).toBe('LEGACY_SHARED');
    expect(await prisma.bed.count({ where: { roomId: legacy.id } })).toBe(0);
  });

  test('simultaneous approvals cannot assign the same bed twice', async () => {
    const one = await request(2), two = await request(3);
    const outcomes = await Promise.allSettled([RoomShareService.review(one.id, owner, true, beds[0]), RoomShareService.review(two.id, owner, true, beds[0])]);
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.tenancy.count({ where: { bedId: beds[0], status: 'ACTIVE' } })).toBe(1);
  });

  test('requires an available bed in the correct room and owner approval', async () => {
    const row = await request(2);
    await expect(RoomShareService.review(row.id, stranger, true, beds[0])).rejects.toThrow('FORBIDDEN');
    await expect(RoomShareService.review(row.id, owner, true)).rejects.toThrow('Choose an available bed');
    const other = await RoomService.create(propertyId, owner, { roomNumber: '102', capacity: 1, monthlyRent: 1000, rentalMode: 'PER_BED' });
    const foreign = await prisma.bed.findFirstOrThrow({ where: { roomId: other.id } });
    await expect(RoomShareService.review(row.id, owner, true, foreign.id)).rejects.toThrow('Bed is unavailable');
    await RoomService.saveBed(roomId, owner, beds[0], { label: 'Bed 1', monthlyRent: 2000, status: 'MAINTENANCE' });
    await expect(RoomShareService.review(row.id, owner, true, beds[0])).rejects.toThrow('Bed is unavailable');
  });

  test('whole-room rental reserves the room, regardless of physical capacity', async () => {
    await RoomService.update(roomId, owner, { rentalMode: 'WHOLE_ROOM' });
    const one = await request(2), two = await request(3);
    await RoomShareService.review(one.id, owner, true);
    await expect(RoomShareService.review(two.id, owner, true)).rejects.toThrow('Room is full');
  });

  test('cannot convert, archive, or mark assigned rooms and beds unavailable', async () => {
    await assign(2);
    await expect(RoomService.update(roomId, owner, { rentalMode: 'WHOLE_ROOM' })).rejects.toThrow('End active');
    await expect(RoomService.update(roomId, owner, { capacity: 1 })).rejects.toThrow('Archive unused beds');
    await expect(RoomService.updateStatus(roomId, owner, 'VACANT')).rejects.toThrow('End active');
    await expect(RoomService.archive(roomId, owner)).rejects.toThrow('End active');
    await expect(RoomService.archiveBed(roomId, beds[0], owner)).rejects.toThrow('End the bed tenancy');
    await expect(RoomService.saveBed(roomId, owner, beds[0], { label: 'Bed 1', monthlyRent: 2000, status: 'MAINTENANCE' })).rejects.toThrow('assigned bed');
  });

  test('each tenant gets agreed rent, own parking, Wi-Fi and immutable bill snapshots', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    await TenantService.setParkingMode(propertyId, one.id, owner, 'USE_PROPERTY_RATE');
    const first = await bill(one.id), second = await bill(two.id);
    expect(first.totalAmount.toFixed(2)).toBe('2700.25');
    expect(second.totalAmount.toFixed(2)).toBe('2700.75');
    expect(second.items.find(item => item.itemType === 'PARKING')).toBeUndefined();
    expect(second.items.find(item => item.itemType === 'RENT')?.description).toContain('Upper bunk');
    await RoomService.saveBed(roomId, owner, beds[0], { label: 'Renamed', monthlyRent: 9999, status: 'VACANT' });
    expect((await prisma.tenancy.findUniqueOrThrow({ where: { id: one.id } })).monthlyRent.toFixed(2)).toBe('2000.00');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: first.id } })).totalAmount.toFixed(2)).toBe('2700.25');
    expect((await bill(one.id, '2030-03')).items.find(item => item.itemType === 'RENT')?.amount.toFixed(2)).toBe('2000.00');
    expect((await BillingService.getTenantBills(users[2])).every(row => row.tenancyId === one.id)).toBe(true);
    await expect(BillingService.getTenantBillDetail(first.id, users[3])).rejects.toThrow('FORBIDDEN');
  });

  test('fixed utilities apply once per tenancy, free parking remains zero', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    await TenantService.setParkingMode(propertyId, two.id, owner, 'FREE');
    await prisma.utilityConfig.update({ where: { propertyId_utilityType: { propertyId, utilityType: 'WATER' } }, data: { billingMethod: 'FIXED_RATE', fixedAmount: 100.25 } });
    expect((await bill(one.id)).totalAmount.toFixed(2)).toBe('2300.50');
    const second = await bill(two.id);
    expect(second.totalAmount.toFixed(2)).toBe('2801.00');
    expect(second.items.find(item => item.itemType === 'PARKING')?.amount.toFixed(2)).toBe('0.00');
  });

  test('room-meter shares reconcile to the centavo and reject duplicate monthly bills', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    const config = await prisma.utilityConfig.update({ where: { propertyId_utilityType: { propertyId, utilityType: 'ELECTRICITY' } }, data: { billingMethod: 'METERED', splitMethod: 'PER_ROOM', ratePerUnit: 10, unit: 'kWh' } });
    const reading = await prisma.meterReading.create({ data: { utilityConfigId: config.id, propertyId, roomId, billingPeriodStart: philippineDate('2030-01-01'), billingPeriodEnd: philippineDate('2030-01-31', true), previousReading: 0, currentReading: 10.001, consumption: 10.001, rateAtTime: 10, chargeAmount: 100.01, readingDate: philippineDate('2030-01-31'), createdById: owner } });
    const first = await bill(one.id, '2030-01', { electricityMeterReadingId: reading.id });
    const second = await bill(two.id, '2030-01', { electricityMeterReadingId: reading.id });
    const sum = new Decimal(first.items.find(item => item.itemType === 'ELECTRICITY')!.amount).plus(second.items.find(item => item.itemType === 'ELECTRICITY')!.amount);
    expect(sum.toFixed(2)).toBe('100.01');
    await expect(bill(one.id, '2030-01', { electricityMeterReadingId: reading.id })).rejects.toThrow('already exists');
  });

  test('cannot silently change utility policy midway through issuing one month of bills', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    await bill(one.id);
    await prisma.utilityConfig.update({ where: { propertyId_utilityType: { propertyId, utilityType: 'WATER' } }, data: { billingMethod: 'FIXED_RATE', fixedAmount: 100 } });
    await expect(bill(two.id)).rejects.toThrow('configuration changed');
    expect(await prisma.bill.count({ where: { tenancyId: two.id } })).toBe(0);
  });

  test('historical utilities include former occupants and exclude future move-ins', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    await TenantService.endTenancy(two.id, owner);
    await prisma.tenancy.update({ where: { id: two.id }, data: { endDate: philippineDate('2030-01-20', true) } });
    const future = await assign(4, beds[1]);
    await prisma.tenancy.update({ where: { id: future.id }, data: { startDate: philippineDate('2030-02-01') } });
    await prisma.utilityConfig.update({ where: { propertyId_utilityType: { propertyId, utilityType: 'ELECTRICITY' } }, data: { billingMethod: 'METERED', splitMethod: 'EQUAL_SPLIT', ratePerUnit: 10, unit: 'kWh' } });
    const first = await bill(one.id, '2030-01', { sharedElectricityAmount: 100.01 });
    const second = await bill(two.id, '2030-01', { sharedElectricityAmount: 100.01 });
    expect(new Decimal(first.items.find(i => i.itemType === 'ELECTRICITY')!.amount).plus(second.items.find(i => i.itemType === 'ELECTRICITY')!.amount).toFixed(2)).toBe('100.01');
    expect(await prisma.utilityShare.count({ where: { tenancyId: future.id } })).toBe(0);
    await expect(bill(future.id)).rejects.toThrow('does not overlap');
    await expect(bill(two.id, '2030-03')).rejects.toThrow('does not overlap');
  });

  test('move-out releases only the assigned bed, keeps financial history and is idempotent', async () => {
    const one = await assign(2), two = await assign(3, beds[1]);
    const first = await bill(one.id);
    await TenantService.endTenancy(one.id, owner);
    const replacement = await assign(4, beds[0]);
    await TenantService.endTenancy(one.id, owner);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: beds[0] } })).status).toBe('OCCUPIED');
    expect((await prisma.tenancy.findUniqueOrThrow({ where: { id: replacement.id } })).activeBedKey).toBe(beds[0]);
    expect((await prisma.tenancy.findUniqueOrThrow({ where: { id: two.id } })).status).toBe('ACTIVE');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: first.id } })).totalAmount.toFixed(2)).toBe('2200.25');
  });

  test('pending invitations reserve beds; cancellation releases without generating bills', async () => {
    await TenantService.inviteTenant(propertyId, owner, { name: marker, email: marker + '@example.test', roomId, bedId: beds[0], startDate: '2030-01-01', monthlyRent: 1 });
    const pending = await prisma.tenancy.findFirstOrThrow({ where: { roomId, status: 'PENDING' } });
    users.push(pending.tenantId);
    expect(pending.monthlyRent.toFixed(2)).toBe('2000.00');
    const row = await request(2);
    await expect(RoomShareService.review(row.id, owner, true, beds[0])).rejects.toThrow('already assigned');
    await TenantService.endTenancy(pending.id, owner);
    await expect(bill(pending.id)).rejects.toThrow('not active');
    await RoomShareService.review(row.id, owner, true, beds[0]);
  });

  test('shared QR links continue to require approval and do not expose occupants', async () => {
    const links = await RoomShareService.links(propertyId, owner);
    const input = parseInvitationInput(links[0].invitationUrl);
    if (input.type !== 'room') throw new Error('Expected a room link');
    const preview = await RoomShareService.preview(input, users[2]);
    expect(preview.needsApproval).toBe(true);
    expect(JSON.stringify(preview)).not.toContain(users[3]);
    await RoomShareService.request(input, users[2]);
    expect(await prisma.tenancy.count({ where: { tenantId: users[2] } })).toBe(0);
  });

  test('total due includes older bills and subtracts actual nonvoided payments', async () => {
    const one = await assign(2);
    const first = await bill(one.id);
    await bill(one.id, '2030-03');
    const payment = await PaymentService.recordPayment({ billId: first.id, amount: 100.25, paymentMethod: 'CASH', paymentDate: philippineDate('2030-01-20'), recordedById: owner, idempotencyKey: randomUUID() }, owner);
    expect((await TenantService.getTenantDashboard(users[2]))?.outstandingBalance).toBe(4300.25);
    await PaymentService.voidPayment(payment.id, 'Fixture reversal', owner);
    expect((await TenantService.getTenantDashboard(users[2]))?.outstandingBalance).toBe(4400.50);
  });

  test('a paid latest bill cannot hide an older unpaid balance or show a paid overview badge', async () => {
    const one = await assign(2);
    await bill(one.id);
    const latest = await bill(one.id, '2030-03');
    await PaymentService.recordPayment({ billId: latest.id, amount: 2200.25, paymentMethod: 'CASH', paymentDate: philippineDate('2030-03-20'), recordedById: owner, idempotencyKey: randomUUID() }, owner);
    const dashboard = await TenantService.getTenantDashboard(users[2]);
    expect(dashboard?.currentBill?.status).toBe('PAID');
    expect(dashboard?.outstandingBalance).toBe(2200.25);
    expect(dashboard?.outstandingStatus).not.toBe('PAID');
    expect(dashboard?.earliestUnpaidDueDate).toEqual(philippineDate('2030-01-31', true));
  });

  test('declining a request needs no bed, creates no tenancy and keeps the bed available', async () => {
    const row = await request(2);
    await RoomShareService.review(row.id, owner, false);
    expect((await prisma.roomAccessRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('REJECTED');
    expect(await prisma.tenancy.count({ where: { tenantId: users[2] } })).toBe(0);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: beds[0] } })).status).toBe('VACANT');
  });

  test('bed writes enforce ownership and valid exact money bounds', async () => {
    await expect(RoomService.saveBed(roomId, stranger, beds[0], { label: 'Bed 1', monthlyRent: 100, status: 'VACANT' })).rejects.toThrow('FORBIDDEN');
    for (const monthlyRent of [Infinity, -1, 0, 1.001, 100000000]) {
      await expect(RoomService.saveBed(roomId, owner, beds[0], { label: 'Bed 1', monthlyRent, status: 'VACANT' })).rejects.toThrow();
    }
    await expect(RoomService.archiveBed(roomId, beds[0], stranger)).rejects.toThrow('FORBIDDEN');
  });

  test('confirmed partial Cash and GCash receipts retain exact balances for the correct bed', async () => {
    const one = await assign(2), first = await bill(one.id);
    const payment = await PaymentService.recordPayment({ billId: first.id, amount: 200, paymentMethod: 'CASH', paymentDate: philippineDate('2030-01-20'), recordedById: owner, idempotencyKey: randomUUID() }, owner);
    expect((await ReceiptService.getForUser(payment.id, users[2]))?.balance).toBe('2000.25');
    expect(await ReceiptService.getForUser(payment.id, users[3])).toBeNull();
    await PaymentService.recordPayment({ billId: first.id, amount: 2000.25, paymentMethod: 'GCASH', referenceNumber: randomUUID(), paymentDate: philippineDate('2030-01-21'), recordedById: owner, idempotencyKey: randomUUID() }, owner);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('PAID');
  });
});
