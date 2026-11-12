import type { Prisma, MaintenanceStatus, MaintenancePriority } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { withTransactionRetry } from '@/lib/db/transaction-retry';
import { listQuery, pageWindow, LIST_PAGE_SIZE, type ListQuery } from '@/lib/lists/query';

export class MaintenanceListService {
  static async forProperty(propertyId: string, landlordId: string, raw: ListQuery = {}) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return this.list({ propertyId, property: { landlordId } }, raw);
  }
  static async forTenant(tenantId: string, raw: ListQuery = {}) {
    return this.list({ createdById: tenantId, tenancy: { tenantId } }, raw);
  }
  private static async list(scope: Prisma.MaintenanceRequestWhereInput, raw: ListQuery) {
    const query = listQuery(raw);
    if (!query.status && ['open', 'completed', 'cancelled'].includes(query.filter)) query.status = query.filter.toUpperCase();
    if (!['OPEN', 'SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(query.status)) query.status = '';
    if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(query.priority)) query.priority = '';
    query.filter = '';
    const where: Prisma.MaintenanceRequestWhereInput = { ...scope,
      ...(query.status ? { status: query.status === 'OPEN' ? { in: ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] } : query.status as MaintenanceStatus } : {}),
      ...(query.priority ? { priority: query.priority as MaintenancePriority } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q } }, { description: { contains: query.q } }, { room: { roomNumber: { contains: query.q } } }, { createdBy: { name: { contains: query.q } } }] } : {}),
    };
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const window = pageWindow(await tx.maintenanceRequest.count({ where }), query.page);
      const records = await tx.maintenanceRequest.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
        include: { room: { select: { roomNumber: true } }, createdBy: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return { ...window, records, query };
    }, { isolationLevel: 'RepeatableRead' }));
  }
}
