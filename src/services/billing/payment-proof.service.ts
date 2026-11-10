import { withTransactionRetry } from "@/lib/db/transaction-retry";
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { normalizePaymentProof } from '@/lib/security/payment-proof-image';
import { gcashReferenceKey } from '@/lib/utils/payment-details';
import { TenantFundsService } from './tenant-funds.service';
import { PaymentService } from './payment.service';

// Lists deliberately exclude image bytes and internal request keys from rendered pages.
export const proofSummarySelect = {
  id: true, amount: true, paymentDate: true, referenceNumber: true, status: true,
  rejectionReason: true, createdAt: true, reviewedAt: true,
  payment: { select: { id: true, voidedAt: true } },
} satisfies Prisma.PaymentProofSelect;

export class PaymentProofService {
  static async getPendingForLandlord(landlordId: string, requestedPage = 1) {
    const pageSize = 5;
    const safePage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const where: Prisma.PaymentProofWhereInput = {
      status: 'PENDING', bill: { property: { landlordId, landlord: { role: 'LANDLORD' } } },
    };
    // One snapshot keeps the count and pagination consistent during concurrent reviews.
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const total = await tx.paymentProof.count({ where });
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(safePage, pages);
      const proofs = await tx.paymentProof.findMany({
        where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: pageSize, skip: (page - 1) * pageSize,
        select: {
          id: true, amount: true, createdAt: true, billId: true,
          bill: { select: {
            propertyId: true, status: true, cancelledAt: true,
            property: { select: { name: true } },
            tenancy: { select: { tenant: { select: { name: true } }, room: { select: { roomNumber: true } }, bed: { select: { label: true } } } },
          } },
        },
      });
      return { total, page, pages, proofs };
    }, { isolationLevel: 'RepeatableRead' }));
  }

  static async submit(billId: string, tenantId: string, input: { amount: string; paymentDate: Date; referenceNumber: string; idempotencyKey: string; file: File }) {
    const bill = await prisma.bill.findFirst({ where: { id: billId, tenancy: { tenantId, tenant: { role: 'TENANT' } } }, include: { property: { select: { landlordId: true } } } });
    if (!bill) throw new Error('Bill not available.');
    if (!(await checkRateLimit('proof-submit:' + tenantId, { limit: 10, windowMs: 86400000 })).allowed) throw new Error('Too many submissions. Please try again tomorrow.');
    let amount: Decimal;
    try { amount = new Decimal(input.amount); } catch { throw new Error('Enter a valid payment amount.'); }
    if (!amount.isFinite() || amount.lte(0) || amount.gt('99999999.99') || amount.decimalPlaces() > 2) throw new Error('Enter a valid payment amount with at most two decimals.');
    if (!Number.isFinite(input.paymentDate.getTime()) || input.paymentDate.getTime() > Date.now()) throw new Error('Enter a valid payment date, not in the future.');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.idempotencyKey)) throw new Error('Refresh the page before submitting.');
    const referenceNumber = input.referenceNumber.trim().toUpperCase();
    gcashReferenceKey(bill.property.landlordId, referenceNumber);
    const image = await normalizePaymentProof(input.file);
    const imageHash = createHash('sha256').update(image).digest('hex');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await TenantFundsService.lockTenancy(tx, bill.tenancyId, bill.property.landlordId);
      await tx.$queryRaw`SELECT id FROM bills WHERE id = ${bill.id} FOR UPDATE`;
      const current = await tx.bill.findUniqueOrThrow({ where: { id: bill.id }, include: { tenancy: true, payments: { where: { voidedAt: null } } } });
      if (current.tenancy.tenantId !== tenantId) throw new Error('Bill not available.');
      const prior = await tx.paymentProof.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        if (prior.billId !== bill.id || !amount.eq(prior.amount) || prior.referenceNumber !== referenceNumber || prior.paymentDate.getTime() !== input.paymentDate.getTime() || prior.imageHash !== imageHash) throw new Error('This submission has already been used. Refresh and try again.');
        return prior.id;
      }
      const paid = current.payments.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
      if (current.cancelledAt || current.status === 'CANCELLED' || amount.gt(new Decimal(current.totalAmount).minus(paid))) throw new Error('This amount exceeds the current unpaid balance. Refresh your bill.');
      if (await tx.paymentProof.findUnique({ where: { pendingBillId: bill.id } })) throw new Error('A proof is already awaiting verification for this bill.');
      if (await tx.paymentProof.count({ where: { billId: bill.id } }) >= 10) throw new Error('Submission limit reached for this bill. Please contact your landlord.');
      const proof = await tx.paymentProof.create({ data: { billId: bill.id, amount, paymentDate: input.paymentDate, referenceNumber, image, imageHash, idempotencyKey: input.idempotencyKey, pendingBillId: bill.id } });
      await tx.notification.create({ data: { userId: bill.property.landlordId, type: 'PAYMENT_PROOF_SUBMITTED', title: 'GCash proof awaiting verification', message: 'A tenant submitted proof of GCash payment. Verify the transaction in your GCash account before confirming.', relatedEntityType: 'PaymentProof', relatedEntityId: proof.id } });
      return proof.id;
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async review(proofId: string, landlordId: string, decision: 'APPROVE' | 'REJECT', received: boolean, reason = '') {
    if (!['APPROVE', 'REJECT'].includes(decision)) throw new Error('Invalid review.');
    if (decision === 'APPROVE' && !received) throw new Error('Confirm you verified and received this payment in GCash.');
    reason = reason.trim();
    if (decision === 'REJECT' && (reason.length < 3 || reason.length > 500)) throw new Error('Enter a rejection reason (3-500 characters).');
    if (!(await checkRateLimit('proof-review:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many reviews. Please try again shortly.');
    try {
      return await withTransactionRetry(() => prisma.$transaction(async tx => {
        const reference = await tx.paymentProof.findFirst({ where: { id: proofId, bill: { property: { landlordId, landlord: { role: 'LANDLORD' } } } }, select: { billId: true, bill: { select: { tenancyId: true } } } });
        if (!reference) throw new Error('Proof not available.');
        await TenantFundsService.lockTenancy(tx, reference.bill.tenancyId, landlordId);
        await tx.$queryRaw`SELECT id FROM bills WHERE id = ${reference.billId} FOR UPDATE`;
        const proof = await tx.paymentProof.findUniqueOrThrow({ where: { id: proofId }, include: { payment: true, bill: { include: { tenancy: true } } } });
        if (proof.status !== 'PENDING') {
          if (decision === 'APPROVE' && proof.status === 'APPROVED' && proof.payment && !proof.payment.voidedAt) return proof.payment.id;
          if (decision === 'REJECT' && proof.status === 'REJECTED' && proof.rejectionReason === reason) return null;
          throw new Error('This proof has already been reviewed. Refresh the bill.');
        }
        const payment = decision === 'APPROVE' ? await PaymentService.recordInTransaction(tx, {
          billId: proof.billId, amount: Number(proof.amount), paymentDate: proof.paymentDate,
          paymentMethod: 'GCASH', referenceNumber: proof.referenceNumber, recordedById: landlordId,
        }, landlordId) : null;
        await tx.paymentProof.update({ where: { id: proofId }, data: { status: payment ? 'APPROVED' : 'REJECTED', pendingBillId: null, paymentId: payment?.id, reviewedAt: new Date(), reviewedById: landlordId, rejectionReason: payment ? null : reason } });
        await tx.notification.updateMany({ where: { userId: landlordId, relatedEntityType: 'PaymentProof', relatedEntityId: proofId }, data: { isRead: true } });
        if (!payment) await tx.notification.create({ data: { userId: proof.bill.tenancy.tenantId, type: 'PAYMENT_PROOF_REVIEWED', title: 'GCash proof needs attention', message: 'Your landlord declined the proof: ' + reason, relatedEntityType: 'Bill', relatedEntityId: proof.billId } });
        return payment?.id ?? null;
      }, { isolationLevel: 'ReadCommitted' }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new Error('This GCash reference is already recorded. Check existing payments before reviewing again.');
      throw error;
    }
  }

  static async imageForUser(proofId: string, userId: string) {
    return prisma.paymentProof.findFirst({ where: { id: proofId, bill: { OR: [{ tenancy: { tenantId: userId } }, { property: { landlordId: userId } }] } }, select: { image: true } });
  }
}
