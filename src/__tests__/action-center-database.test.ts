import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { ActionCenterService } from '@/services/operations/action-center.service';
import { BillListService } from '@/services/billing/bill-list.service';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Action center ownership, real balances and navigation', () => {
  const users: string[] = [], properties: string[] = [], bills: string[] = [], repairs: string[] = [];
  const now = new Date('2026-11-12T12:00:00Z');
  let owner: string, stranger: string, tenant: string, otherTenant: string, settledId: string, cancelledId: string, foreignBill: string;
  beforeAll(async () => {
    for (const role of ['LANDLORD', 'LANDLORD', 'TENANT', 'TENANT'] as const) users.push((await prisma.user.create({ data: { name: 'Action fixture ' + randomUUID(), role, passwordHash: 'test-only' } })).id);
    [owner, stranger, tenant, otherTenant] = users;
    for (let index = 0; index < 2; index++) {
      const property = await prisma.property.create({ data: { landlordId: index ? stranger : owner, name: index ? 'Foreign place' : 'Action House', address: 'Fixture address', rooms: { create: { roomNumber: 'R101', monthlyRent: 100 } } }, include: { rooms: true } });
      properties.push(property.id);
      const tenancy = await prisma.tenancy.create({ data: { tenantId: index ? otherTenant : tenant, propertyId: property.id, roomId: property.rooms[0].id, monthlyRent: 100, status: 'ACTIVE', startDate: new Date('2025-01-01') } });
      const base = { tenancyId: tenancy.id, propertyId: property.id, createdById: index ? stranger : owner, totalAmount: 100, amountPaid: 25, dueDate: new Date('2026-01-01'), billingPeriodStart: new Date('2025-12-01'), billingPeriodEnd: new Date('2025-12-31') };
      for (let i = 0; i < (index ? 1 : 25); i++) {
        const row = await prisma.bill.create({ data: { ...base, id: `action-${String(i).padStart(2, '0')}-${randomUUID()}` } });
        if (index) foreignBill = row.id; else bills.push(row.id);
      }
      if (!index) {
        settledId = (await prisma.bill.create({ data: { ...base, amountPaid: 100 } })).id;
        cancelledId = (await prisma.bill.create({ data: { ...base, cancelledAt: now, status: 'CANCELLED' } })).id;
        await prisma.bill.create({ data: { ...base, amountPaid: 0, totalAmount: 0 } });
        await prisma.bill.create({ data: { ...base, dueDate: new Date('2090-01-01') } });
      }
      for (let i = 0; i < (index ? 1 : 26); i++) {
        const repair = await prisma.maintenanceRequest.create({ data: { propertyId: property.id, tenancyId: tenancy.id, roomId: property.rooms[0].id, createdById: index ? otherTenant : tenant, title: `Action repair ${i}`, description: 'Test repair details', category: 'PLUMBING', priority: i === 0 || i === 25 ? 'URGENT' : i === 1 ? 'HIGH' : 'LOW', status: i === 25 ? 'COMPLETED' : 'SUBMITTED', createdAt: new Date('2026-01-01') } });
        if (!index && i < 25) repairs.push(repair.id);
      }
    }
    for (const billId of [bills[0], settledId, cancelledId, foreignBill]) await prisma.paymentProof.create({ data: { billId, amount: 25, paymentDate: now, referenceNumber: 'fixture', image: Buffer.from('fixture'), imageHash: 'a'.repeat(64), idempotencyKey: randomUUID(), pendingBillId: billId } });
  });

  test('counts unresolved obligations from amounts even when stored status is stale', async () => {
    expect(await ActionCenterService.summary(owner, now)).toEqual({ proofs: 3, overdue: 25, repairs: 25, urgent: 1 });
    expect(await ActionCenterService.summary(tenant, now)).toEqual({ proofs: 0, overdue: 0, repairs: 0, urgent: 0 });
  });
  test('stable pages show every overdue bill once, with pending proof context', async () => {
    const pages = await Promise.all([1, 2, 3].map(page => ActionCenterService.list(owner, { filter: 'overdue', page: String(page) }, now)));
    expect(pages.map(page => page.records.length)).toEqual([12, 12, 1]);
    expect(new Set(pages.flatMap(page => page.records.map(row => row.id)))).toEqual(new Set(bills));
    expect(pages[0].records[0]).toMatchObject({ id: bills[0], amount: '75.00', warning: expect.stringContaining('awaiting review') });
    expect((await ActionCenterService.list(owner, { filter: 'overdue', page: '99999', q: 'Action House' }, now)).page).toBe(3);
  });
  test('repair priority outranks age and exact links are independent of list pagination', async () => {
    const result = await ActionCenterService.list(owner, { filter: 'repairs' }, now);
    expect(result.records.slice(0, 2).map(row => row.id)).toEqual(repairs.slice(0, 2));
    expect(result.records[0].href).toBe(`/landlord/properties/${properties[0]}/maintenance/${repairs[0]}`);
    expect((await ActionCenterService.list(owner, { filter: 'repairs', priority: 'URGENT', q: 'R101' }, now)).total).toBe(1);
    expect((await ActionCenterService.list(owner, { filter: 'repairs', q: 'Foreign' }, now)).total).toBe(0);
  });
  test('proofs on settled and cancelled bills stay reviewable without exposing image bytes', async () => {
    const result = await ActionCenterService.list(owner, { filter: 'proofs' }, now);
    expect(result.total).toBe(3);
    expect(result.records.some(row => row.warning?.includes('already settled'))).toBe(true);
    expect(result.records.some(row => row.warning?.includes('Bill cancelled'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('image');
    expect(result.records.every(row => row.href.includes(properties[0]))).toBe(true);
    expect((await ActionCenterService.list(stranger, { filter: 'overdue', q: 'Action House' }, now)).total).toBe(0);
  });
  test('exact tenant bill selection reaches old records and never crosses tenant ownership', async () => {
    expect((await BillListService.forTenant(tenant, { bill: bills[24] })).records.map(row => row.id)).toEqual([bills[24]]);
    expect((await BillListService.forTenant(otherTenant, { bill: bills[24] })).total).toBe(0);
    expect((await BillListService.forTenant(tenant, { bill: foreignBill })).total).toBe(0);
  });
  test('archiving a property does not hide unresolved obligations', async () => {
    await prisma.property.update({ where: { id: properties[0] }, data: { archivedAt: now } });
    expect(await ActionCenterService.summary(owner, now)).toEqual({ proofs: 3, overdue: 25, repairs: 25, urgent: 1 });
  });

  afterAll(async () => {
    await prisma.paymentProof.deleteMany({ where: { bill: { propertyId: { in: properties } } } });
    await prisma.maintenanceRequest.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.bill.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.tenancy.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.room.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.property.deleteMany({ where: { id: { in: properties } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
});
