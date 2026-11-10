import Decimal from 'decimal.js';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { hasDownloadableReceipt, receiptSnapshotSchema } from '@/lib/utils/receipt-data';

export class ReceiptService {
  static async snapshot(tx: Prisma.TransactionClient, paymentId: string) {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: {
      recordedBy: { select: { name: true } },
      bill: { include: { property: true, payments: { where: { voidedAt: null } } } },
      tenancy: { include: { tenant: { select: { name: true } }, room: true, bed: true } },
    } });
    if (!hasDownloadableReceipt(payment) || payment.bill.cancelledAt) throw new Error('Only confirmed Cash or GCash payments can have receipts.');
    const paid = payment.bill.payments.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
    const snapshot = receiptSnapshotSchema.parse({
      version: 1, number: 'AT-' + payment.id.toUpperCase(),
      tenantName: payment.tenancy.tenant.name, landlordName: payment.recordedBy.name,
      propertyName: payment.bill.property.name, propertyAddress: payment.bill.property.address, room: payment.tenancy.room.roomNumber + (payment.tenancy.bed ? ' / ' + payment.tenancy.bed.label : ''),
      periodStart: payment.bill.billingPeriodStart.toISOString(), periodEnd: payment.bill.billingPeriodEnd.toISOString(),
      paymentDate: payment.paymentDate.toISOString(), confirmedAt: payment.confirmedAt!.toISOString(),
      method: payment.paymentMethod, reference: payment.referenceNumber,
      amount: new Decimal(payment.amount).toFixed(2), totalBilled: new Decimal(payment.bill.totalAmount).toFixed(2),
      totalPaid: paid.toFixed(2), balance: Decimal.max(0, new Decimal(payment.bill.totalAmount).minus(paid)).toFixed(2),
    });
    return tx.paymentReceipt.create({ data: { paymentId, snapshot } });
  }

  static async confirmExisting(paymentId: string, landlordId: string) {
    if (!(await checkRateLimit('receipt-confirm:' + landlordId, { limit: 30, windowMs: 60000 })).allowed) throw new Error('Too many confirmations. Please try again shortly.');
    return prisma.$transaction(async tx => {
      const reference = await tx.payment.findUnique({ where: { id: paymentId }, select: { billId: true } });
      if (!reference) throw new Error('FORBIDDEN');
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${reference.billId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { bill: { include: { property: true } }, receipt: true } });
      if (!payment || payment.bill.property.landlordId !== landlordId || payment.recordedById !== landlordId) throw new Error('FORBIDDEN');
      if (payment.voidedAt || payment.bill.cancelledAt || !['CASH', 'GCASH'].includes(payment.paymentMethod)) throw new Error('This payment cannot have a receipt.');
      if (payment.receipt && payment.confirmedAt) return payment.receipt;
      await tx.payment.update({ where: { id: payment.id }, data: { confirmedAt: new Date() } });
      return this.snapshot(tx, payment.id);
    }, { isolationLevel: 'ReadCommitted' });
  }

  static async getForUser(paymentId: string, userId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: {
      receipt: true, tenancy: { select: { tenantId: true } }, bill: { select: { cancelledAt: true, property: { select: { landlordId: true } } } },
    } });
    if (!payment || (payment.tenancy.tenantId !== userId && payment.bill.property.landlordId !== userId) ||
      !hasDownloadableReceipt(payment) || payment.bill.cancelledAt || !payment.receipt) return null;
    return receiptSnapshotSchema.parse(payment.receipt.snapshot);
  }
}
