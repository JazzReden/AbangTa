import { loadEnvConfig } from '@next/env';
import { prisma } from '@/lib/db/prisma';
import { BillingService } from '@/services/billing/billing.service';
import { PaymentService } from '@/services/billing/payment.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { MeterReadingService } from '@/services/billing/meter-reading.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { tokenDigest } from '@/lib/security/tokens';
import { randomUUID } from 'node:crypto';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('MySQL financial and invitation integrity (isolated test fixtures)', () => {
  let landlordId: string, tenantId: string, strangerId: string, propertyId: string, roomId: string, tenancyId: string, billId: string;
  const marker = 'test-' + randomUUID();
  const start = philippineDate('2030-10-01');
  const end = philippineDate('2030-10-31', true);
  const due = philippineDate('2030-11-15', true);
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const landlord = await prisma.user.create({ data: { name: marker, email: marker + '-l@example.test', role: 'LANDLORD', passwordHash: 'test-only' } });
    landlordId = landlord.id;
    const tenant = await prisma.user.create({ data: { name: marker, email: marker + '-t@example.test', role: 'TENANT', passwordHash: 'test-only', googleSubject: marker } });
    tenantId = tenant.id;
    const stranger = await prisma.user.create({ data: { name: marker, email: marker + '-s@example.test', role: 'TENANT', passwordHash: 'test-only', googleSubject: marker + '-s' } });
    strangerId = stranger.id;
    const property = await prisma.property.create({ data: { landlordId, name: marker, address: 'Test fixture' } });
    propertyId = property.id;
    const room = await prisma.room.create({ data: { propertyId, roomNumber: 'test', monthlyRent: 100, capacity: 2, status: 'OCCUPIED' } });
    roomId = room.id;
    const tenancy = await prisma.tenancy.create({ data: { propertyId, roomId, tenantId, startDate: start, monthlyRent: 100, status: 'ACTIVE' } });
    tenancyId = tenancy.id;
    await prisma.utilityConfig.createMany({ data: [
      { propertyId, utilityType: 'WATER', billingMethod: 'INCLUDED' },
      { propertyId, utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' },
    ] });
  });

  test('simultaneous bill generation creates only one bill', async () => {
    const input = { tenancyId, billingPeriodStart: start, billingPeriodEnd: end, dueDate: due, createdById: landlordId };
    const results = await Promise.allSettled([
      BillingService.generateMonthlyBill(input, landlordId),
      BillingService.generateMonthlyBill(input, landlordId),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const bills = await prisma.bill.findMany({ where: { propertyId }, include: { items: true } });
    expect(bills).toHaveLength(1);
    billId = bills[0].id;
    expect(bills[0].totalAmount.toFixed(2)).toBe('100.00');
    expect(bills[0].items.filter(i => i.isIncluded)).toHaveLength(2);
  });

  test('simultaneous payments cannot overpay and voiding reconciles in one transaction', async () => {
    const input = { billId, amount: 60, paymentDate: start, paymentMethod: 'CASH' as const, recordedById: strangerId };
    const results = await Promise.allSettled([
      PaymentService.recordPayment(input, landlordId), PaymentService.recordPayment(input, landlordId),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const payments = await prisma.payment.findMany({ where: { billId, voidedAt: null } });
    expect(payments).toHaveLength(1);
    expect(payments[0].recordedById).toBe(landlordId);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: billId } })).amountPaid.toFixed(2)).toBe('60.00');
    await expect(BillingService.cancelBill(billId, landlordId)).rejects.toThrow();
    await PaymentService.voidPayment(payments[0].id, 'Test reversal', landlordId);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: billId } })).amountPaid.toFixed(2)).toBe('0.00');
    await expect(PaymentService.recordPayment(input, strangerId)).rejects.toThrow('FORBIDDEN');
    await expect(BillingService.getTenantBillDetail(billId, strangerId)).rejects.toThrow('FORBIDDEN');
  });

  test('meter configuration cannot be used for a different property', async () => {
    const config = await prisma.utilityConfig.findFirstOrThrow({ where: { propertyId, utilityType: 'ELECTRICITY' } });
    await expect(MeterReadingService.createReading({
      propertyId: 'different-property', utilityConfigId: config.id, roomId, previousReading: 0, currentReading: 10,
      billingPeriodStart: start, billingPeriodEnd: end, readingDate: end, createdById: landlordId,
    }, landlordId)).rejects.toThrow();
  });

  test('electricity meter charges and saved allocations survive occupancy changes', async () => {
    const config = await prisma.utilityConfig.findFirstOrThrow({ where: { propertyId, utilityType: 'ELECTRICITY' } });
    await prisma.utilityConfig.update({ where: { id: config.id }, data: { billingMethod: 'METERED', splitMethod: 'PER_ROOM', ratePerUnit: 15, unit: 'kWh' } });
    const roommate = await prisma.user.create({ data: { name: marker, email: marker + '-roommate@example.test', role: 'TENANT', passwordHash: 'test-only' } });
    const roommateTenancy = await prisma.tenancy.create({ data: { propertyId, roomId, tenantId: roommate.id, startDate: start, monthlyRent: 100, status: 'ACTIVE' } });
    const november = philippineDate('2030-11-01');
    const novemberEnd = philippineDate('2030-11-30', true);
    const reading = await MeterReadingService.createReading({
      propertyId, roomId, utilityConfigId: config.id, previousReading: 1250, currentReading: 1280,
      billingPeriodStart: november, billingPeriodEnd: novemberEnd, readingDate: novemberEnd, createdById: strangerId,
    }, landlordId);
    expect(reading.chargeAmount.toFixed(2)).toBe('450.00');
    expect(reading.createdById).toBe(landlordId);
    const input = { tenancyId, billingPeriodStart: november, billingPeriodEnd: novemberEnd, dueDate: due, createdById: landlordId, electricityMeterReadingId: reading.id };
    const bill = await BillingService.generateMonthlyBill(input, landlordId);
    expect(bill.totalAmount.toFixed(2)).toBe('325.00');
    await expect(BillingService.generateMonthlyBill({
      ...input, billingPeriodStart: philippineDate('2030-12-01'), billingPeriodEnd: philippineDate('2030-12-31', true),
    }, landlordId)).rejects.toThrow('reading does not match');
    await TenantService.endTenancy(roommateTenancy.id, landlordId);
    expect((await prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('OCCUPIED');
    const allocation = await prisma.utilityAllocation.findFirstOrThrow({ where: { configId: config.id }, include: { shares: true } });
    expect(allocation.shares.map(s => s.amount.toFixed(2))).toEqual(['225.00', '225.00']);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: bill.id } })).totalAmount.toFixed(2)).toBe('325.00');
    // Save a property allocation, change occupancy, then bill another original participant.
    const roomTwo = await prisma.room.create({ data: { propertyId, roomNumber: 'test-2', capacity: 1, monthlyRent: 100, status: 'OCCUPIED' } });
    const other = await prisma.tenancy.create({ data: { propertyId, roomId: roomTwo.id, tenantId: strangerId, startDate: start, monthlyRent: 100, status: 'ACTIVE' } });
    const returning = await prisma.tenancy.create({ data: { propertyId, roomId, tenantId: roommate.id, startDate: start, monthlyRent: 100, status: 'ACTIVE' } });
    await prisma.utilityConfig.update({ where: { id: config.id }, data: { splitMethod: 'EQUAL_SPLIT' } });
    const shared = { tenancyId, billingPeriodStart: philippineDate('2030-12-01'), billingPeriodEnd: philippineDate('2030-12-31', true), dueDate: philippineDate('2031-01-15', true), sharedElectricityAmount: 1000, createdById: landlordId };
    const first = await BillingService.generateMonthlyBill(shared, landlordId);
    expect(first.totalAmount.toFixed(2)).toBe('350.00');
    await TenantService.endTenancy(other.id, landlordId);
    const second = await BillingService.generateMonthlyBill({ ...shared, tenancyId: returning.id }, landlordId);
    expect(second.totalAmount.toFixed(2)).toBe('350.00');
    await expect(BillingService.generateMonthlyBill({ ...shared, sharedElectricityAmount: 1200, billingPeriodStart: philippineDate('2030-12-02') }, landlordId)).rejects.toThrow();
    await TenantService.endTenancy(returning.id, landlordId);
    await prisma.utilityConfig.update({ where: { id: config.id }, data: { billingMethod: 'INCLUDED' } });
  });

  test('invitation acceptance checks Google identity, expiry, replay and ended tenancy', async () => {
    await TenantService.endTenancy(tenancyId, landlordId);
    const tenant = await prisma.user.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.email) throw new Error('The invitation test fixture requires an email');
    const invitation = await TenantService.inviteTenant(propertyId, landlordId, {
      name: marker, email: tenant.email, roomId, startDate: '2030-10-01', monthlyRent: 100,
    });
    const token = new URL(invitation.inviteUrl).searchParams.get('token')!;
    expect((await prisma.inviteToken.findUniqueOrThrow({ where: { token: tokenDigest(token) } })).token).not.toBe(token);
    await expect(TenantService.acceptInvitation(token, strangerId)).rejects.toThrow();
    await TenantService.acceptInvitation(token, tenantId);
    await expect(TenantService.acceptInvitation(token, tenantId)).rejects.toThrow();
    const active = await prisma.tenancy.findFirstOrThrow({ where: { propertyId, tenantId, status: 'ACTIVE' } });
    await TenantService.endTenancy(active.id, landlordId);
    const second = await TenantService.inviteTenant(propertyId, landlordId, { name: marker, email: tenant.email, roomId, startDate: '2030-10-01', monthlyRent: 100 });
    const expired = new URL(second.inviteUrl).searchParams.get('token')!;
    await prisma.inviteToken.update({ where: { token: tokenDigest(expired) }, data: { expiresAt: new Date(0) } });
    await expect(TenantService.acceptInvitation(expired, tenantId)).rejects.toThrow();
  });

  afterAll(async () => {
    if (propertyId) {
      await prisma.notification.deleteMany({ where: { userId: { in: [landlordId, tenantId, strangerId].filter(Boolean) } } });
      await prisma.payment.deleteMany({ where: { bill: { propertyId } } });
      await prisma.billItem.deleteMany({ where: { bill: { propertyId } } });
      await prisma.bill.deleteMany({ where: { propertyId } });
      await prisma.utilityShare.deleteMany({ where: { tenancy: { propertyId } } });
      await prisma.utilityAllocation.deleteMany({ where: { config: { propertyId } } });
      await prisma.inviteToken.deleteMany({ where: { tenancy: { propertyId } } });
      await prisma.tenancy.deleteMany({ where: { propertyId } });
      await prisma.meterReading.deleteMany({ where: { propertyId } });
      await prisma.utilityConfig.deleteMany({ where: { propertyId } });
      await prisma.room.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });
    }
    await prisma.tenantProfile.deleteMany({ where: { userId: { in: [landlordId, tenantId, strangerId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { name: marker } });
    await prisma.$disconnect();
  });
});
