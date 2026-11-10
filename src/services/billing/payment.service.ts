import { withTransactionRetry } from "@/lib/db/transaction-retry";
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { gcashReferenceKey } from '@/lib/utils/payment-details';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { prisma } from '@/lib/db/prisma';
import { billStatusFromAmounts, canAcceptPayment } from '@/lib/utils/billing';
import type { PaymentInput } from '@/types';
import { ReceiptService } from './receipt.service';
import { TenantFundsService } from './tenant-funds.service';
import { reserveGCashReference } from './money-reference';

export class PaymentService {
  static async recordPayment(input: PaymentInput, landlordId: string) {
    if (!(await checkRateLimit('payment-record:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many payment attempts. Please try again shortly.');
    try {
      return await withTransactionRetry(() => prisma.$transaction(tx => this.recordInTransaction(tx, input, landlordId), { isolationLevel: 'ReadCommitted' }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new Error('This payment request or GCash reference has already been recorded');
      throw error;
    }
  }

  // Proof approval must commit its review, payment, bill balance and receipt together.
  static async recordInTransaction(tx: Prisma.TransactionClient, input: PaymentInput, landlordId: string) {
    const amount = new Decimal(input.amount);
    if (!amount.isFinite() || amount.lte(0) || amount.gt('99999999.99') || amount.decimalPlaces() > 2 || !Number.isFinite(new Date(input.paymentDate).getTime())) throw new Error('Invalid payment amount or date');
    if (!['CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER'].includes(input.paymentMethod)) throw new Error('Invalid payment method');
    if (input.idempotencyKey && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.idempotencyKey)) throw new Error('Invalid payment request');
    const referenceNumber = input.referenceNumber?.trim().toUpperCase();
    if ((referenceNumber?.length ?? 0) > 100 || (input.notes?.length ?? 0) > 500) throw new Error('Payment details are too long');
    const referenceKey = input.paymentMethod === 'GCASH' ? gcashReferenceKey(landlordId, referenceNumber ?? '') : undefined;
    const reference = await tx.bill.findUnique({ where: { id: input.billId }, select: { tenancyId: true } });
    if (!reference) throw new Error('FORBIDDEN');
    await TenantFundsService.lockTenancy(tx, reference.tenancyId, landlordId);
    await tx.$queryRaw`SELECT id FROM bills WHERE id = ${input.billId} FOR UPDATE`;
    const bill = await tx.bill.findUnique({
      where: { id: input.billId },
      include: { property: true, tenancy: true, payments: { where: { voidedAt: null } } },
    });
    if (!bill || bill.property.landlordId !== landlordId) throw new Error('FORBIDDEN');
    if (input.idempotencyKey) {
      const prior = await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        if (prior.billId !== bill.id || prior.recordedById !== landlordId || prior.voidedAt ||
          !new Decimal(prior.amount).equals(amount) || prior.paymentMethod !== input.paymentMethod ||
          prior.paymentDate.getTime() !== new Date(input.paymentDate).getTime() ||
          (prior.referenceNumber ?? '') !== (referenceNumber ?? '') || (prior.notes ?? '') !== (input.notes ?? '')) throw new Error('This payment request has already been used. Refresh before recording another payment.');
        return prior;
      }
    }
    if (referenceKey) {
      const duplicate = await tx.payment.findFirst({ where: { OR: [
        { referenceKey }, { paymentMethod: 'GCASH', referenceNumber, recordedById: landlordId },
      ] } });
      if (duplicate) throw new Error('This GCash reference has already been recorded');
    }
    if (bill.cancelledAt || bill.status === 'CANCELLED') throw new Error('Cannot pay a cancelled bill');
    const paid = bill.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    const remaining = new Decimal(bill.totalAmount).minus(paid);
    const validation = canAcceptPayment(amount, remaining);
    if (!validation.ok) throw new Error(validation.message);
    if (referenceKey) await reserveGCashReference(tx, landlordId, referenceNumber ?? '');
    const payment = await tx.payment.create({ data: {
      billId: bill.id, tenancyId: bill.tenancyId, amount,
      paymentDate: new Date(input.paymentDate), paymentMethod: input.paymentMethod,
      referenceNumber, referenceKey, idempotencyKey: input.idempotencyKey, notes: input.notes, recordedById: landlordId, confirmedAt: new Date(),
    } });
    const newPaid = paid.plus(amount);
    await tx.bill.update({ where: { id: bill.id }, data: {
      amountPaid: newPaid, status: billStatusFromAmounts(bill.totalAmount, newPaid, bill.dueDate),
    } });
    await tx.notification.create({ data: {
      userId: bill.tenancy.tenantId, type: 'PAYMENT_RECORDED', title: 'Payment recorded',
      message: 'A payment of PHP ' + amount.toFixed(2) + ' has been recorded.',
      relatedEntityType: 'Payment', relatedEntityId: payment.id,
    } });
    if (['CASH', 'GCASH'].includes(payment.paymentMethod)) await ReceiptService.snapshot(tx, payment.id);
    await tx.notification.updateMany({
      where: { userId: bill.tenancy.tenantId, relatedEntityType: 'Bill', relatedEntityId: bill.id, type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] } }, data: { isRead: true },
    });
    return payment;
  }

  static async voidPayment(paymentId: string, reason: string, landlordId: string) {
    if (!reason.trim() || reason.length > 500) throw new Error('A valid reversal reason is required');
    if (!(await checkRateLimit('payment-void:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many reversals. Please try again shortly.');
    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const reference = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!reference) throw new Error('Payment not found');
      await TenantFundsService.lockTenancy(tx, reference.tenancyId, landlordId);
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${reference.billId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({
        where: { id: paymentId }, include: { bill: { include: { property: true } } },
      });
      if (!payment || payment.bill.property.landlordId !== landlordId) throw new Error('FORBIDDEN');
      if (payment.voidedAt) throw new Error('Payment already voided');
      if (payment.paymentMethod === 'ADVANCE') {
        const balance = await TenantFundsService.balances(tx, payment.tenancyId);
        if (balance.advance.plus(payment.amount).gt('99999999.99')) throw new Error('Refund unused advance credit before reversing this application');
      }
      await tx.payment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
      const payments = await tx.payment.findMany({ where: { billId: payment.billId, voidedAt: null } });
      const paid = payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
      await tx.bill.update({ where: { id: payment.billId }, data: {
        amountPaid: paid, status: billStatusFromAmounts(payment.bill.totalAmount, paid, payment.bill.dueDate),
      } });
      return { success: true };
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async getLandlordPayments(landlordId: string) {
    return prisma.payment.findMany({
      where: {
        tenancy: { property: { landlordId } },
        voidedAt: null,
      },
      include: {
        bill: {
          select: {
            id: true,
            status: true,
            billingPeriodStart: true,
            property: { select: { name: true } },
          },
        },
        tenancy: {
          include: {
            tenant: { select: { name: true, email: true } },
            room: { select: { roomNumber: true } },
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
      take: 100,
    });
  }

  static async getTenantPayments(tenantId: string) {
    return prisma.payment.findMany({
      where: { tenancy: { tenantId }, voidedAt: null },
      include: {
        bill: {
          select: {
            id: true,
            billingPeriodStart: true,
            status: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }
}
