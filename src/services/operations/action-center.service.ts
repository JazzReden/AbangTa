import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withTransactionRetry } from '@/lib/db/transaction-retry';
import { listQuery, pageWindow, LIST_PAGE_SIZE, type ListQuery } from '@/lib/lists/query';
import { remainingBalance } from '@/lib/utils/billing';

export type ActionCategory = 'proofs' | 'overdue' | 'repairs';
export type ActionItem = {
  id: string; title: string; location: string; detail: string;
  date: Date; dateLabel: string; href: string; action: string;
  amount?: string; amountLabel?: string; warning?: string;
};
export type ActionSummary = { proofs: number; overdue: number; repairs: number; urgent: number };

function scope(landlordId: string, now: Date) {
  // Include archived properties: unresolved obligations must remain visible.
  const property = { landlordId, landlord: { role: 'LANDLORD' as const } };
  const overdue: Prisma.BillWhereInput = {
    property, cancelledAt: null, status: { not: 'CANCELLED' },
    dueDate: { lt: now }, amountPaid: { lt: prisma.bill.fields.totalAmount },
  };
  const repairs: Prisma.MaintenanceRequestWhereInput = {
    property, status: { in: ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
  };
  const proofs: Prisma.PaymentProofWhereInput = { status: 'PENDING', bill: { property } };
  return { overdue, repairs, proofs };
}

const location = (property: string, room: string) => `${property} · Room ${room}`;
const billLocation = {
  property: { select: { name: true } },
  tenancy: { select: { tenant: { select: { name: true } }, room: { select: { roomNumber: true } } } },
} satisfies Prisma.BillSelect;

export class ActionCenterService {
  static async summary(landlordId: string, now = new Date()): Promise<ActionSummary> {
    const where = scope(landlordId, now);
    const [proofs, overdue, repairs, urgent] = await prisma.$transaction([
      prisma.paymentProof.count({ where: where.proofs }),
      prisma.bill.count({ where: where.overdue }),
      prisma.maintenanceRequest.count({ where: where.repairs }),
      prisma.maintenanceRequest.count({ where: { ...where.repairs, priority: 'URGENT' } }),
    ], { isolationLevel: 'RepeatableRead' });
    return { proofs, overdue, repairs, urgent };
  }

  static async list(landlordId: string, raw: ListQuery = {}, now = new Date()) {
    const parsed = listQuery(raw);
    const filter: ActionCategory = ['proofs', 'overdue', 'repairs'].includes(parsed.filter) ? parsed.filter as ActionCategory : 'proofs';
    const query = { q: parsed.q, filter, priority: filter === 'repairs' && parsed.priority === 'URGENT' ? 'URGENT' : '' };
    const scoped = scope(landlordId, now);
    const contains = { contains: query.q };
    const billSearch: Prisma.BillWhereInput = query.q ? { OR: [
      { property: { name: contains } }, { tenancy: { tenant: { name: contains } } },
      { tenancy: { room: { roomNumber: contains } } },
    ] } : {};

    return withTransactionRetry(() => prisma.$transaction(async tx => {
      let records: ActionItem[];
      if (filter === 'overdue') {
        const where: Prisma.BillWhereInput = { AND: [scoped.overdue, billSearch] };
        const window = pageWindow(await tx.bill.count({ where }), parsed.page);
        const rows = await tx.bill.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
          orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
          select: { id: true, propertyId: true, totalAmount: true, amountPaid: true, dueDate: true, ...billLocation,
            paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
          },
        });
        records = rows.map(row => ({
          id: row.id, title: row.tenancy.tenant.name, location: location(row.property.name, row.tenancy.room.roomNumber),
          detail: 'Overdue bill', date: row.dueDate, dateLabel: 'Due',
          amount: remainingBalance(row.totalAmount, row.amountPaid).toFixed(2), amountLabel: 'Unpaid balance',
          warning: row.paymentProofs.length ? 'GCash proof awaiting review. Check it before following up.' : undefined,
          href: `/landlord/properties/${row.propertyId}/bills/${row.id}`, action: 'Review bill',
        }));
        return { ...window, query, records };
      }
      if (filter === 'repairs') {
        const where: Prisma.MaintenanceRequestWhereInput = { ...scoped.repairs,
          ...(query.priority ? { priority: 'URGENT' } : {}),
          ...(query.q ? { OR: [{ title: contains }, { property: { name: contains } }, { room: { roomNumber: contains } }, { createdBy: { name: contains } }] } : {}),
        };
        const window = pageWindow(await tx.maintenanceRequest.count({ where }), parsed.page);
        const rows = await tx.maintenanceRequest.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
          orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true, propertyId: true, title: true, priority: true, status: true, createdAt: true,
            property: { select: { name: true } }, room: { select: { roomNumber: true } }, createdBy: { select: { name: true } } },
        });
        records = rows.map(row => ({
          id: row.id, title: row.title, location: location(row.property.name, row.room.roomNumber),
          detail: `${row.createdBy.name} · ${row.status.replaceAll('_', ' ').toLowerCase()}`,
          date: row.createdAt, dateLabel: 'Reported', warning: `${row.priority.toLowerCase()} priority`,
          href: `/landlord/properties/${row.propertyId}/maintenance/${row.id}`, action: 'Update repair',
        }));
        return { ...window, query, records };
      }
      const where: Prisma.PaymentProofWhereInput = { AND: [scoped.proofs, { bill: billSearch }] };
      const window = pageWindow(await tx.paymentProof.count({ where }), parsed.page);
      const rows = await tx.paymentProof.findMany({ where, take: LIST_PAGE_SIZE, skip: window.skip,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, billId: true, amount: true, createdAt: true,
          bill: { select: { propertyId: true, totalAmount: true, amountPaid: true, status: true, cancelledAt: true, ...billLocation } } },
      });
      records = rows.map(row => ({
        id: row.id, title: row.bill.tenancy.tenant.name, location: location(row.bill.property.name, row.bill.tenancy.room.roomNumber),
        detail: 'GCash proof awaiting your verification', date: row.createdAt, dateLabel: 'Submitted',
        amount: row.amount.toFixed(2), amountLabel: 'Submitted amount',
        warning: row.bill.cancelledAt || row.bill.status === 'CANCELLED' ? 'Bill cancelled. Review this proof before taking further action.'
          : remainingBalance(row.bill.totalAmount, row.bill.amountPaid).isZero() ? 'Bill already settled. Check for a duplicate payment.' : undefined,
        href: `/landlord/properties/${row.bill.propertyId}/bills/${row.billId}#proof-${row.id}`, action: 'Review proof',
      }));
      return { ...window, query, records };
    }, { isolationLevel: 'RepeatableRead' }));
  }
}
