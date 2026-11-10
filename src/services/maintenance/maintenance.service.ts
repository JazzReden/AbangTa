import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { createMaintenanceSchema, updateMaintenanceStatusSchema, type CreateMaintenanceInput } from '@/lib/validations';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { withTransactionRetry } from '@/lib/db/transaction-retry';
import type { MaintenanceStatus } from '@prisma/client';

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  SUBMITTED: 'submitted', ACKNOWLEDGED: 'acknowledged', IN_PROGRESS: 'in progress', COMPLETED: 'completed', CANCELLED: 'cancelled',
};

export class MaintenanceService {
  static async createRequest(input: CreateMaintenanceInput, tenantId: string, tenancyId: string) {
    input = createMaintenanceSchema.parse(input);
    if (!(await checkRateLimit('maintenance-submit:' + tenantId, { limit: 10, windowMs: 60000 })).allowed) throw new Error('Too many requests. Please wait a minute.');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const reference = await tx.tenancy.findUnique({ where: { id: tenancyId }, select: { propertyId: true } });
      if (!reference) throw new Error('Tenancy not found');
      // Same property-first order as move-out and occupancy writes.
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM tenancies WHERE id = ${tenancyId} FOR UPDATE`;
      const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, include: {
        tenant: { select: { role: true } }, room: { select: { archivedAt: true } },
        property: { select: { landlordId: true, archivedAt: true, landlord: { select: { role: true } } } },
      } });
      if (tenancy.tenantId !== tenantId || tenancy.tenant.role !== 'TENANT') throw new Error('FORBIDDEN');
      if (tenancy.status !== 'ACTIVE' || tenancy.cancelledAt || tenancy.property.archivedAt || tenancy.room.archivedAt || tenancy.property.landlord.role !== 'LANDLORD') throw new Error('Your tenancy is not active');
      const request = await tx.maintenanceRequest.create({ data: { ...input, tenancyId, propertyId: tenancy.propertyId, roomId: tenancy.roomId, status: 'SUBMITTED', createdById: tenantId } });
      await tx.notification.create({ data: {
        userId: tenancy.property.landlordId, type: 'MAINTENANCE_STATUS_CHANGED', title: 'New Maintenance Request',
        message: `${input.priority} priority request submitted: "${input.title}"`, relatedEntityType: 'MaintenanceRequest', relatedEntityId: request.id,
      } });
      return request;
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async updateStatus(requestId: string, status: MaintenanceStatus, statusNotes: string | undefined, landlordId: string) {
    const parsed = updateMaintenanceStatusSchema.parse({ status, statusNotes });
    if (!(await checkRateLimit('maintenance-update:' + landlordId, { limit: 30, windowMs: 60000 })).allowed) throw new Error('Too many updates. Please wait a minute.');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const reference = await tx.maintenanceRequest.findUnique({ where: { id: requestId }, select: { propertyId: true } });
      if (!reference) throw new Error('Maintenance request not found');
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM maintenance_requests WHERE id = ${requestId} FOR UPDATE`;
      const request = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId }, include: {
        property: { select: { landlordId: true, landlord: { select: { role: true } } } }, tenancy: { select: { tenantId: true } },
      } });
      if (request.property.landlordId !== landlordId || request.property.landlord.role !== 'LANDLORD') throw new Error('FORBIDDEN');
      const notes = parsed.statusNotes ?? null;
      if (request.status === parsed.status && request.statusNotes === notes) return request;
      const updated = await tx.maintenanceRequest.update({ where: { id: requestId }, data: { status: parsed.status, statusNotes: notes } });
      await tx.notification.create({ data: {
        userId: request.tenancy.tenantId, type: 'MAINTENANCE_STATUS_CHANGED', title: 'Maintenance Request Updated',
        message: `Your request "${request.title}" is now ${STATUS_LABELS[parsed.status]}.`, relatedEntityType: 'MaintenanceRequest', relatedEntityId: requestId,
      } });
      return updated;
    }, { isolationLevel: 'ReadCommitted' }));
  }

  /** Get all requests for a property (landlord view). */
  static async getPropertyRequests(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.maintenanceRequest.findMany({
      where: { propertyId },
      include: {
        room: { select: { roomNumber: true } },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async getTenantRequests(tenantId: string) {
    return prisma.maintenanceRequest.findMany({
      where: { createdById: tenantId },
      include: { room: { select: { roomNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getLandlordRequests(landlordId: string, status?: MaintenanceStatus) {
    return prisma.maintenanceRequest.findMany({
      where: {
        property: { landlordId },
        ...(status ? { status } : {}),
      },
      include: {
        room: { select: { roomNumber: true } },
        property: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
      },
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
