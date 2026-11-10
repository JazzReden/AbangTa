import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import type { Prisma } from '@prisma/client';

const day = 24 * 60 * 60 * 1000;
export class ReminderService {
  static async forTenant(tenantId: string) {
    const bills = await prisma.bill.findMany({ where: { tenancy: { tenantId }, cancelledAt: null, status: { notIn: ['PAID', 'CANCELLED'] }, amountPaid: { lt: prisma.bill.fields.totalAmount } }, select: { id: true } });
    return prisma.notification.findMany({ where: { userId: tenantId, isRead: false, type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] }, relatedEntityType: 'Bill', relatedEntityId: { in: bills.map(bill => bill.id) } }, orderBy: { createdAt: 'desc' }, take: 6 });
  }

  private static async deliver(billId: string, now: Date, landlordId?: string) {
    return prisma.$transaction(tx => this.deliverTx(tx, billId, now, landlordId), { isolationLevel: 'ReadCommitted' });
  }

  static async deliverTx(tx: Prisma.TransactionClient, billId: string, now: Date, landlordId?: string, message?: string) {
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;
      const bill = await tx.bill.findUnique({ where: { id: billId }, include: {
        property: true, tenancy: { include: { room: true, tenant: { select: { role: true } } } }, payments: { where: { voidedAt: null } }, paymentProofs: { where: { status: 'PENDING' }, select: { id: true }, take: 1 },
      } });
      if (!bill || (landlordId && bill.property.landlordId !== landlordId)) throw new Error('FORBIDDEN');
      const paid = bill.payments.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
      const balance = new Decimal(bill.totalAmount).minus(paid);
      if (bill.cancelledAt || bill.status === 'CANCELLED' || bill.status === 'PAID' || balance.lte(0) || bill.property.archivedAt || bill.tenancy.tenant.role !== 'TENANT') return { sent: false, reason: 'This bill has no outstanding balance or is unavailable.' };
      if (!landlordId && (bill.tenancy.status !== 'ACTIVE' || bill.tenancy.room.archivedAt || bill.dueDate.getTime() > now.getTime() + 3 * day)) return { sent: false, reason: 'Not due for an automatic reminder.' };
      if (!landlordId && bill.paymentProofs.length) return { sent: false, reason: 'Payment proof is awaiting landlord verification.' };
      if (bill.lastReminderAt && now.getTime() - bill.lastReminderAt.getTime() < day) return { sent: false, reason: 'A reminder was already sent within the last 24 hours.' };
      // The bill lock serializes payments; the tenant lock serializes reminders
      // across different bills, landlords and application instances.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${bill.tenancy.tenantId} FOR UPDATE`;
      const tenant = await tx.user.findUnique({ where: { id: bill.tenancy.tenantId }, select: { role: true, lastBillReminderAt: true } });
      if (!tenant || tenant.role !== 'TENANT') return { sent: false, reason: 'Tenant is unavailable.' };
      if (tenant.lastBillReminderAt && now.getTime() - tenant.lastBillReminderAt.getTime() < day) return { sent: false, reason: 'This tenant already received a bill reminder within the last 24 hours.' };
      const overdue = bill.dueDate < now;
      const due = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }).format(bill.dueDate);
      await tx.notification.updateMany({ where: { userId: bill.tenancy.tenantId, type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] }, relatedEntityType: 'Bill', isRead: false }, data: { isRead: true } });
      await tx.notification.create({ data: {
        userId: bill.tenancy.tenantId, type: overdue ? 'RENT_OVERDUE' : 'RENT_DUE_SOON',
        title: overdue ? 'Unpaid bill reminder' : 'Upcoming bill reminder',
        message: message ?? `${bill.property.name}, Room ${bill.tenancy.room.roomNumber}: PHP ${balance.toFixed(2)} remains unpaid. Due ${due}. Payments are updated after your landlord confirms receipt.`,
        relatedEntityType: 'Bill', relatedEntityId: bill.id,
      } });
      await tx.bill.update({ where: { id: billId }, data: { lastReminderAt: now } });
      await tx.user.update({ where: { id: bill.tenancy.tenantId }, data: { lastBillReminderAt: now } });
      return { sent: true, reason: 'Reminder sent to the tenant in AbangTa.' };
  }

  static async send(billId: string, landlordId: string) {
    const owner = await prisma.bill.findFirst({ where: { id: billId, property: { landlordId } }, select: { id: true } });
    if (!owner) throw new Error('FORBIDDEN');
    if (!(await checkRateLimit('bill-reminder:' + landlordId, { limit: 30, windowMs: 60000 })).allowed) throw new Error('Too many reminders. Please try again shortly.');
    return this.deliver(billId, new Date(), landlordId);
  }

  static async runDue(now = new Date(), propertyId?: string) {
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid reminder date');
    const bills = await prisma.bill.findMany({ where: {
      propertyId, cancelledAt: null, status: { notIn: ['PAID', 'CANCELLED'] }, amountPaid: { lt: prisma.bill.fields.totalAmount },
      dueDate: { lte: new Date(now.getTime() + 3 * day) }, property: { archivedAt: null },
      tenancy: { status: 'ACTIVE', room: { archivedAt: null }, tenant: { role: 'TENANT', OR: [{ lastBillReminderAt: null }, { lastBillReminderAt: { lte: new Date(now.getTime() - day) } }] } },
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: new Date(now.getTime() - day) } }],
    }, select: { id: true }, orderBy: [{ lastReminderAt: 'asc' }, { dueDate: 'asc' }, { id: 'asc' }], take: 100 });
    let sent = 0;
    for (const bill of bills) if ((await this.deliver(bill.id, now)).sent) sent++;
    return { checked: bills.length, sent };
  }
}
