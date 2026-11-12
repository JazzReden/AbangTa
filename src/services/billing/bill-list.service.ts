import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { withTransactionRetry } from '@/lib/db/transaction-retry';
import { listQuery, pageWindow, LIST_PAGE_SIZE, type ListQuery } from '@/lib/lists/query';
import { getBillingPeriod } from '@/lib/utils/dates';

function filters(raw: ListQuery) {
  const query = listQuery(raw);
  if (!['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'].includes(query.status)) query.status = '';
  const where: Prisma.BillWhereInput = { cancelledAt: null, status: { not: 'CANCELLED' } };
  const total = prisma.bill.fields.totalAmount;
  const unpaid: Prisma.BillWhereInput = { OR: [{ amountPaid: { lt: total } }, { totalAmount: 0 }] };
  const now = new Date();
  // Use current balances/dates so overdue filters agree with the displayed badge.
  if (query.status === 'PAID') where.AND = [{ amountPaid: { gte: total }, totalAmount: { gt: 0 } }];
  if (query.status === 'OVERDUE') where.AND = [unpaid, { dueDate: { lt: now } }];
  if (query.status === 'PENDING') where.AND = [{ amountPaid: 0, dueDate: { gte: now } }];
  if (query.status === 'PARTIALLY_PAID') where.AND = [{ amountPaid: { gt: 0, lt: total }, dueDate: { gte: now } }];
  if (query.month) {
    const [year, month] = query.month.split('-').map(Number);
    const { start, end } = getBillingPeriod(year, month);
    where.billingPeriodStart = { gte: start, lte: end };
  }
  if (query.q) where.OR = [
    { tenancy: { tenant: { name: { contains: query.q } } } },
    { tenancy: { room: { roomNumber: { contains: query.q } } } },
    { property: { name: { contains: query.q } } },
  ];
  return { query, where };
}
export class BillListService {
  static async forProperty(propertyId: string, landlordId: string, raw: ListQuery = {}) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    const { query, where } = filters(raw);
    where.propertyId = propertyId;
    where.property = { landlordId };
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const window = pageWindow(await tx.bill.count({ where }), query.page);
      const records = await tx.bill.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
        orderBy: [{ billingPeriodStart: 'desc' }, { id: 'desc' }],
        select: { id: true, totalAmount: true, amountPaid: true, dueDate: true, billingPeriodStart: true,
          tenancy: { select: { tenant: { select: { name: true } }, room: { select: { roomNumber: true } } } },
          paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
        },
      });
      return { ...window, records, query };
    }, { isolationLevel: 'RepeatableRead' }));
  }
  static async forTenant(tenantId: string, raw: ListQuery = {}) {
    const { query, where } = filters(raw);
    const bill = typeof raw.bill === 'string' ? raw.bill.trim().slice(0, 120) : '';
    if (bill) where.id = bill;
    where.tenancy = { tenantId };
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const window = pageWindow(await tx.bill.count({ where }), query.page);
      const records = await tx.bill.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
        orderBy: [{ billingPeriodStart: 'desc' }, { id: 'desc' }],
        include: { items: true, payments: { where: { voidedAt: null } },
          property: { select: { name: true, landlord: { select: { landlordProfile: { select: { gcashName: true, gcashNumber: true } } } } } },
          tenancy: { include: { room: { select: { roomNumber: true } } } },
        },
      });
      return { ...window, records, query };
    }, { isolationLevel: 'RepeatableRead' }));
  }
}
