import { withTransactionRetry } from "@/lib/db/transaction-retry";
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { fundBalances, fundEntrySchema, fundMoney } from '@/lib/utils/tenant-funds';
import { billStatusFromAmounts } from '@/lib/utils/billing';
import { reserveGCashReference } from './money-reference';
import type { z } from 'zod';

type EntryInput = z.input<typeof fundEntrySchema>;
const entryView = { id: true, kind: true, amount: true, paymentDate: true, paymentMethod: true, referenceNumber: true, notes: true, voidedAt: true, voidReason: true, confirmedAt: true } as const;

export class TenantFundsService {
  private static async writeLimit(landlordId: string) {
    if (!(await checkRateLimit('tenant-funds:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many ledger updates. Please try again shortly.');
  }

  static async lockTenancy(tx: Prisma.TransactionClient, tenancyId: string, landlordId: string) {
    const reference = await tx.tenancy.findUnique({ where: { id: tenancyId }, select: { propertyId: true } });
    if (!reference) throw new Error('FORBIDDEN');
    await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM tenancies WHERE id = ${tenancyId} FOR UPDATE`;
    const tenancy = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId }, include: { property: true } });
    if (tenancy.property.landlordId !== landlordId) throw new Error('FORBIDDEN');
    return tenancy;
  }

  static async balances(tx: Prisma.TransactionClient, tenancyId: string) {
    const entries = await tx.tenantFundEntry.groupBy({ by: ['kind'], where: { tenancyId, voidedAt: null }, _sum: { amount: true } });
    const applied = await tx.payment.aggregate({ where: { tenancyId, paymentMethod: 'ADVANCE', voidedAt: null }, _sum: { amount: true } });
    const balance = fundBalances(entries.map(entry => ({ kind: entry.kind, amount: entry._sum.amount ?? 0 })), applied._sum.amount ?? 0);
    this.assertBalances(balance);
    return balance;
  }

  private static assertBalances(balance: { deposit: Decimal; advance: Decimal }) {
    if ([balance.deposit, balance.advance].some(amount => !amount.isFinite() || amount.lt(0) || amount.gt('99999999.99'))) throw new Error('This change would exceed the available deposit or advance balance');
  }

  static async record(tenancyId: string, landlordId: string, raw: EntryInput) {
    const input = fundEntrySchema.parse(raw);
    await this.writeLimit(landlordId);
    try { return await withTransactionRetry(() => prisma.$transaction(async tx => {
      const tenancy = await this.lockTenancy(tx, tenancyId, landlordId);
      const prior = await tx.tenantFundEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (prior) {
        if (prior.tenancyId !== tenancyId || prior.recordedById !== landlordId || prior.voidedAt || prior.kind !== input.kind ||
          !new Decimal(prior.amount).equals(input.amount) || prior.paymentMethod !== input.paymentMethod || prior.paymentDate.getTime() !== input.paymentDate.getTime() ||
          (prior.referenceNumber ?? '') !== (input.referenceNumber ?? '') || (prior.notes ?? '') !== (input.notes ?? '')) throw new Error('This ledger request has already been used. Refresh before recording another entry.');
        return prior;
      }
      if (input.kind.endsWith('RECEIVED') && (tenancy.status !== 'ACTIVE' || tenancy.cancelledAt || tenancy.property.archivedAt)) throw new Error('New funds can only be received for an active tenancy');
      const balance = await this.balances(tx, tenancyId);
      const changes = fundBalances([{ kind: input.kind, amount: input.amount }]);
      this.assertBalances({ deposit: balance.deposit.plus(changes.deposit), advance: balance.advance.plus(changes.advance) });
      if (input.paymentMethod === 'GCASH') await reserveGCashReference(tx, landlordId, input.referenceNumber ?? '');
      const entry = await tx.tenantFundEntry.create({ data: { ...input, tenancyId, recordedById: landlordId } });
      await tx.notification.create({ data: { userId: tenancy.tenantId, type: 'PAYMENT_RECORDED', title: 'Tenant funds updated',
        message: input.kind.replaceAll('_', ' ') + ': PHP ' + new Decimal(input.amount).toFixed(2) + '. Deposit and advance balances are separate from monthly bills.',
        relatedEntityType: 'TenantFunds', relatedEntityId: tenancyId } });
      return entry;
    }, { isolationLevel: 'ReadCommitted' }));
    } catch (error) { this.rethrowDuplicate(error); }
  }

  private static rethrowDuplicate(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new Error('This request or GCash reference has already been recorded');
    throw error;
  }

  static async voidEntry(entryId: string, landlordId: string, reason: string) {
    if (reason.trim().length < 3 || reason.length > 500) throw new Error('Enter a reversal reason of 3 to 500 characters');
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const reference = await tx.tenantFundEntry.findUnique({ where: { id: entryId } });
      if (!reference) throw new Error('FORBIDDEN');
      await this.lockTenancy(tx, reference.tenancyId, landlordId);
      const entry = await tx.tenantFundEntry.findUniqueOrThrow({ where: { id: entryId } });
      if (entry.voidedAt) throw new Error('This entry is already voided');
      const balance = await this.balances(tx, entry.tenancyId);
      const changes = fundBalances([{ kind: entry.kind, amount: entry.amount }]);
      this.assertBalances({ deposit: balance.deposit.minus(changes.deposit), advance: balance.advance.minus(changes.advance) });
      return tx.tenantFundEntry.update({ where: { id: entryId }, data: { voidedAt: new Date(), voidReason: reason.trim() } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async setDepositTarget(tenancyId: string, landlordId: string, amount?: number) {
    if (amount !== undefined && (amount !== 0 || !Number.isFinite(amount))) fundMoney.parse(amount);
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const tenancy = await this.lockTenancy(tx, tenancyId, landlordId);
      if (tenancy.status !== 'ACTIVE' || tenancy.property.archivedAt) throw new Error('Only active tenancy agreements can be updated');
      return tx.tenancy.update({ where: { id: tenancyId }, data: { securityDeposit: amount ?? null } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  // Called inside bill generation as well as explicit allocation. Lock order is
  // always property -> tenancy -> bill, serializing receipts, refunds and allocations.
  static async applyToBillTx(tx: Prisma.TransactionClient, billId: string, landlordId: string, options: { amount?: Decimal.Value; idempotencyKey: string; allowEmpty?: boolean }) {
    const reference = await tx.bill.findUnique({ where: { id: billId }, select: { tenancyId: true } });
    if (!reference) throw new Error('FORBIDDEN');
    const tenancy = await this.lockTenancy(tx, reference.tenancyId, landlordId);
    await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} FOR UPDATE`;
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { payments: { where: { voidedAt: null } } } });
    const prior = await tx.payment.findUnique({ where: { idempotencyKey: options.idempotencyKey } });
    if (prior) {
      if (prior.billId !== billId || prior.paymentMethod !== 'ADVANCE' || prior.voidedAt || prior.recordedById !== landlordId ||
        (options.amount !== undefined && !new Decimal(prior.amount).equals(options.amount))) throw new Error('This advance application request has already been used');
      return prior;
    }
    if (bill.cancelledAt || bill.status === 'CANCELLED' || tenancy.cancelledAt) throw new Error('Cannot apply advance to a cancelled bill or tenancy');
    const paid = bill.payments.reduce((sum, payment) => sum.plus(payment.amount), new Decimal(0));
    const remaining = Decimal.max(0, new Decimal(bill.totalAmount).minus(paid));
    const balance = await this.balances(tx, tenancy.id);
    const amount = options.amount === undefined ? Decimal.min(balance.advance, remaining) : new Decimal(options.amount);
    if (amount.isZero() && options.allowEmpty) return null;
    if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2 || amount.gt(balance.advance) || amount.gt(remaining)) throw new Error('Advance application exceeds the available credit or bill balance');
    const payment = await tx.payment.create({ data: { billId, tenancyId: tenancy.id, amount, paymentMethod: 'ADVANCE', paymentDate: new Date(), confirmedAt: new Date(),
      recordedById: landlordId, idempotencyKey: options.idempotencyKey, notes: 'Applied from previously received advance credit' } });
    await tx.bill.update({ where: { id: billId }, data: { amountPaid: paid.plus(amount), status: billStatusFromAmounts(bill.totalAmount, paid.plus(amount), bill.dueDate) } });
    await tx.notification.updateMany({ where: { userId: tenancy.tenantId, relatedEntityType: 'Bill', relatedEntityId: billId, type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] } }, data: { isRead: true } });
    await tx.notification.create({ data: { userId: tenancy.tenantId, type: 'PAYMENT_RECORDED', title: 'Advance applied to bill', message: 'PHP ' + amount.toFixed(2) + ' of your existing advance credit was applied to this bill. No new cash payment was recorded.', relatedEntityType: 'Bill', relatedEntityId: billId } });
    return payment;
  }

  static async applyAdvance(billId: string, landlordId: string, amount: number, idempotencyKey: string) {
    fundMoney.parse(amount);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(idempotencyKey)) throw new Error('Invalid application request');
    await this.writeLimit(landlordId);
    try { return await withTransactionRetry(() => prisma.$transaction(tx => this.applyToBillTx(tx, billId, landlordId, { amount, idempotencyKey }), { isolationLevel: 'ReadCommitted' })); }
    catch (error) { this.rethrowDuplicate(error); }
  }

  static async getSummary(tenancyId: string, userId: string) {
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const tenancy = await tx.tenancy.findUnique({ where: { id: tenancyId }, select: { id: true, tenantId: true, securityDeposit: true, property: { select: { landlordId: true, name: true } }, room: { select: { roomNumber: true } }, bed: { select: { label: true } } } });
      if (!tenancy || (tenancy.tenantId !== userId && tenancy.property.landlordId !== userId)) throw new Error('FORBIDDEN');
      const balance = await this.balances(tx, tenancyId);
      const entries = await tx.tenantFundEntry.findMany({ where: { tenancyId }, select: entryView, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
      const applications = await tx.payment.findMany({ where: { tenancyId, paymentMethod: 'ADVANCE' }, select: { id: true, amount: true, paymentDate: true, voidedAt: true, voidReason: true, bill: { select: { id: true, billingPeriodStart: true, propertyId: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 });
      return { deposit: balance.deposit.toFixed(2), advance: balance.advance.toFixed(2), expectedDeposit: tenancy.securityDeposit?.toFixed(2) ?? null,
        propertyName: tenancy.property.name, roomNumber: tenancy.room.roomNumber, bedLabel: tenancy.bed?.label, entries, applications };
    }, { isolationLevel: 'RepeatableRead' }));
  }
}
