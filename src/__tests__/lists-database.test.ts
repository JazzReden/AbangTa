import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { BillListService } from '@/services/billing/bill-list.service';
import { MaintenanceListService } from '@/services/maintenance/maintenance-list.service';
import { OperationalHealth } from '@/services/operations/health.service';
const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Scoped searchable lists and durable job health', () => {
  let owner: string, tenant: string, stranger: string, propertyId: string;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    owner = (await prisma.user.create({ data: { name: 'List owner', role: 'LANDLORD', passwordHash: 'fixture' } })).id;
    tenant = (await prisma.user.create({ data: { name: 'List Tenant ' + randomUUID(), role: 'TENANT', passwordHash: 'fixture' } })).id;
    stranger = (await prisma.user.create({ data: { name: 'List stranger', role: 'LANDLORD', passwordHash: 'fixture' } })).id;
    const property = await prisma.property.create({ data: { landlordId: owner, name: 'List property', address: 'Fixture', rooms: { create: { roomNumber: 'R101', monthlyRent: 100 } } }, include: { rooms: true } }); propertyId = property.id;
    const tenancy = await prisma.tenancy.create({ data: { tenantId: tenant, propertyId, roomId: property.rooms[0].id, monthlyRent: 100, status: 'ACTIVE', startDate: new Date() } });
    await prisma.bill.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ id: 'list-bill-' + String(i).padStart(2, '0') + randomUUID(), tenancyId: tenancy.id, propertyId, createdById: owner, totalAmount: 100, amountPaid: i === 0 ? 100 : i === 1 ? 25 : 0, status: 'PENDING', billingPeriodStart: new Date('2026-09-30T16:00:00Z'), billingPeriodEnd: new Date('2026-10-31T15:59:59Z'), dueDate: new Date(i < 3 ? '2020-01-01' : '2090-01-01') })) });
    await prisma.maintenanceRequest.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ id: 'list-repair-' + String(i).padStart(2, '0') + randomUUID(), tenancyId: tenancy.id, propertyId, roomId: property.rooms[0].id, createdById: tenant, title: i === 0 ? 'Leaking faucet' : 'Broken light', description: 'Fixture description for repair', category: 'PLUMBING', status: i === 0 ? 'COMPLETED' : 'SUBMITTED', priority: i === 0 ? 'URGENT' : 'LOW', createdAt: new Date('2026-10-01') })) });
  });
  test('bill pages preserve all records with stable ties and enforce ownership', async () => {
    const pages = await Promise.all([1, 2, 3].map(page => BillListService.forTenant(tenant, { page: String(page) })));
    expect(pages.map(page => page.records.length)).toEqual([12, 12, 1]);
    expect(new Set(pages.flatMap(page => page.records.map(row => row.id))).size).toBe(25);
    expect((await BillListService.forTenant(stranger)).total).toBe(0);
    await expect(BillListService.forProperty(propertyId, stranger)).rejects.toThrow('FORBIDDEN');
    expect((await BillListService.forProperty(propertyId, owner, { q: 'R101', month: '2026-10' })).total).toBe(25);
    expect((await BillListService.forTenant(tenant, { month: '2026-11' })).total).toBe(0);
    expect((await BillListService.forTenant(tenant, { page: '999999999', q: 'List property' })).page).toBe(3);
  });
  test('bill status filters use current dates and amounts instead of stale stored status', async () => {
    expect((await BillListService.forTenant(tenant, { status: 'PAID' })).total).toBe(1);
    expect((await BillListService.forTenant(tenant, { status: 'OVERDUE' })).total).toBe(2);
    expect((await BillListService.forTenant(tenant, { status: 'PENDING' })).total).toBe(22);
    expect((await BillListService.forTenant(tenant, { status: 'NOT_A_STATUS' })).total).toBe(25);
  });
  test('maintenance combines search/status/priority in the scoped query and clamps pages', async () => {
    expect((await MaintenanceListService.forTenant(tenant)).total).toBe(25);
    expect((await MaintenanceListService.forTenant(tenant, { status: 'OPEN', priority: 'LOW', q: 'light' })).total).toBe(24);
    expect((await MaintenanceListService.forTenant(tenant, { status: 'COMPLETED', priority: 'URGENT', q: 'faucet', page: '999' })).records).toHaveLength(1);
    expect((await MaintenanceListService.forProperty(propertyId, owner, { filter: 'open' })).total).toBe(24);
    expect((await MaintenanceListService.forTenant(stranger)).total).toBe(0);
    await expect(MaintenanceListService.forProperty(propertyId, stranger)).rejects.toThrow('FORBIDDEN');
    const pages = await Promise.all([1, 2, 3].map(page => MaintenanceListService.forTenant(tenant, { page: String(page) })));
    expect(new Set(pages.flatMap(page => page.records.map(row => row.id))).size).toBe(25);
  });
  test('reminder health persists failures and recovery and reports stale runs', async () => {
    await OperationalHealth.started(); await OperationalHealth.succeeded();
    expect((await OperationalHealth.readiness(true)).ok).toBe(true);
    const logger = jest.spyOn(console, 'error').mockImplementation(() => {}), info = jest.spyOn(console, 'info').mockImplementation(() => {});
    try { await OperationalHealth.failed(new Error('secret fixture message')); expect((await OperationalHealth.readiness(true)).ok).toBe(false); await OperationalHealth.succeeded(); } finally { logger.mockRestore(); info.mockRestore(); }
    expect((await OperationalHealth.readiness(true, new Date(Date.now() + 16 * 60000))).reminders).toBe('stale-or-failed');
    expect((await OperationalHealth.readiness(false)).ok).toBe(true);
  });
  afterAll(async () => {
    await prisma.maintenanceRequest.deleteMany({ where: { propertyId } }); await prisma.bill.deleteMany({ where: { propertyId } });
    await prisma.tenancy.deleteMany({ where: { propertyId } }); await prisma.room.deleteMany({ where: { propertyId } }); await prisma.property.delete({ where: { id: propertyId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, tenant, stranger] } } }); await prisma.$disconnect();
  });
});
