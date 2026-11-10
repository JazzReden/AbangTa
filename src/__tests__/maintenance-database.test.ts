import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { MaintenanceService } from '@/services/maintenance/maintenance.service';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Maintenance ownership and notifications', () => {
  const marker = 'maintenance-test-' + randomUUID();
  let owner: string, outsider: string, tenant: string, propertyId: string, tenancyId: string, requestId: string;
  const input = { title: 'Leaking kitchen pipe', description: 'The kitchen sink pipe leaks onto the floor.', category: 'PLUMBING' as const, priority: 'HIGH' as const };
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    owner = (await prisma.user.create({ data: { name: marker, email: marker + '-owner@example.test', role: 'LANDLORD', passwordHash: 'fixture-only' } })).id;
    outsider = (await prisma.user.create({ data: { name: marker, email: marker + '-other@example.test', role: 'LANDLORD', passwordHash: 'fixture-only' } })).id;
    tenant = (await prisma.user.create({ data: { name: marker, email: marker + '-tenant@example.test', role: 'TENANT', passwordHash: 'fixture-only' } })).id;
    propertyId = (await prisma.property.create({ data: { landlordId: owner, name: marker, address: 'Fixture only' } })).id;
    const room = await prisma.room.create({ data: { propertyId, roomNumber: '101', monthlyRent: 4000 } });
    tenancyId = (await prisma.tenancy.create({ data: { tenantId: tenant, propertyId, roomId: room.id, monthlyRent: 4000, startDate: new Date(), status: 'ACTIVE' } })).id;
  });
  test('tenant submission is visible to the owner and creates a linked notification', async () => {
    const request = await MaintenanceService.createRequest(input, tenant, tenancyId);
    requestId = request.id;
    expect((await MaintenanceService.getPropertyRequests(propertyId, owner))[0].id).toBe(requestId);
    expect(await prisma.notification.count({ where: { userId: owner, relatedEntityType: 'MaintenanceRequest', relatedEntityId: requestId } })).toBe(1);
    await expect(MaintenanceService.getPropertyRequests(propertyId, outsider)).rejects.toThrow('FORBIDDEN');
    await expect(MaintenanceService.createRequest(input, outsider, tenancyId)).rejects.toThrow('FORBIDDEN');
  });
  test('only the owner can update status, and the tenant sees the note and notification', async () => {
    await expect(MaintenanceService.updateStatus(requestId, 'COMPLETED', 'Unauthorized', outsider)).rejects.toThrow('FORBIDDEN');
    expect((await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('SUBMITTED');
    await MaintenanceService.updateStatus(requestId, 'IN_PROGRESS', 'Plumber scheduled.', owner);
    const requests = await MaintenanceService.getTenantRequests(tenant);
    expect(requests[0].status).toBe('IN_PROGRESS');
    expect(requests[0].statusNotes).toBe('Plumber scheduled.');
    expect(await prisma.notification.count({ where: { userId: tenant, relatedEntityId: requestId } })).toBe(1);
    await MaintenanceService.updateStatus(requestId, 'COMPLETED', 'Pipe repaired.', owner);
    expect((await MaintenanceService.getLandlordRequests(owner, 'COMPLETED'))[0].id).toBe(requestId);
    expect(await MaintenanceService.getLandlordRequests(outsider)).toHaveLength(0);
  });
  test('simultaneous identical status updates produce one notification', async () => {
    const before = await prisma.notification.count({ where: { userId: tenant, relatedEntityId: requestId } });
    await Promise.all(Array.from({ length: 4 }, () => MaintenanceService.updateStatus(requestId, 'COMPLETED', 'Verified repair completed.', owner)));
    expect(await prisma.notification.count({ where: { userId: tenant, relatedEntityId: requestId } })).toBe(before + 1);
  });
  test('an ended tenancy cannot create a request or notification', async () => {
    await prisma.tenancy.update({ where: { id: tenancyId }, data: { status: 'ENDED', endDate: new Date() } });
    const before = await prisma.maintenanceRequest.count({ where: { tenancyId } });
    const notifications = await prisma.notification.count({ where: { userId: owner } });
    await expect(MaintenanceService.createRequest(input, tenant, tenancyId)).rejects.toThrow('not active');
    expect(await prisma.maintenanceRequest.count({ where: { tenancyId } })).toBe(before);
    expect(await prisma.notification.count({ where: { userId: owner } })).toBe(notifications);
  });
  afterAll(async () => {
    if (propertyId) {
      await prisma.maintenanceRequest.deleteMany({ where: { propertyId } });
      await prisma.tenancy.deleteMany({ where: { propertyId } });
      await prisma.room.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });
    }
    await prisma.notification.deleteMany({ where: { userId: { in: [owner, outsider, tenant].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { name: marker } });
    await prisma.$disconnect();
  });
});
