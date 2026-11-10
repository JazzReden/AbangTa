import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { TenantFundsService as Funds } from '@/services/billing/tenant-funds.service';
import { BillingService } from '@/services/billing/billing.service';
import { PaymentService } from '@/services/billing/payment.service';
import { PropertyService } from '@/services/properties/property.service';
import { ReminderService } from '@/services/billing/reminder.service';
import { ReceiptService } from '@/services/billing/receipt.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import type { TenantFundKind } from '@prisma/client';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Separate deposits and advance payment accounting', () => {
  let owner: string, outsider: string, propertyId: string, leases: string[], users: string[], date: Date;
  beforeAll(() => loadEnvConfig(process.cwd()));
  beforeEach(async () => {
    users = []; leases = []; date = new Date(Date.now() - 60000);
    for (let i = 0; i < 4; i++) users.push((await prisma.user.create({ data: { name: 'Funds fixture ' + randomUUID(), role: i < 2 ? 'LANDLORD' : 'TENANT', passwordHash: 'test-only' } })).id);
    [owner, outsider] = users;
    propertyId = (await prisma.property.create({ data: { landlordId: owner, name: 'Funds fixture ' + randomUUID(), address: 'Isolated test only',
      utilityConfigs: { create: [{ utilityType: 'WATER', billingMethod: 'INCLUDED' }, { utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' }] },
      billingCharges: { create: [{ itemType: 'WIFI', treatment: 'ADDITIONAL', amount: 100.25 }, { itemType: 'PARKING', treatment: 'ADDITIONAL', amount: 500 }] },
    } })).id;
    for (let i = 0; i < 2; i++) {
      const room = await prisma.room.create({ data: { propertyId, roomNumber: String(i), capacity: 1, rentalMode: 'PER_BED', monthlyRent: 1000, status: 'OCCUPIED', beds: { create: { label: 'Bed 1', monthlyRent: 1000, status: 'OCCUPIED' } } }, include: { beds: true } });
      leases.push((await prisma.tenancy.create({ data: { propertyId, roomId: room.id, bedId: room.beds[0].id, activeBedKey: room.beds[0].id, tenantId: users[i + 2], status: 'ACTIVE', monthlyRent: 1000, securityDeposit: 5000, startDate: philippineDate('2026-01-01') } })).id);
    }
  });
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { tenancy: { propertyId } } });
    await prisma.bill.deleteMany({ where: { propertyId } });
    await prisma.tenantFundEntry.deleteMany({ where: { tenancyId: { in: leases } } });
    await prisma.tenancy.deleteMany({ where: { propertyId } });
    await prisma.room.deleteMany({ where: { propertyId } });
    await prisma.utilityConfig.deleteMany({ where: { propertyId } });
    await prisma.property.delete({ where: { id: propertyId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => prisma.$disconnect());

  function entry(kind: TenantFundKind, amount: number) {
    return { kind, amount, paymentMethod: kind === 'DEPOSIT_DEDUCTED' ? null : 'CASH' as const, paymentDate: date, notes: kind === 'DEPOSIT_DEDUCTED' ? 'Documented repair deduction' : undefined, idempotencyKey: randomUUID() };
  }
  function receive(kind: TenantFundKind, amount: number, index = 0) { return Funds.record(leases[index], owner, entry(kind, amount)); }
  function bill(month = '2030-01', applyAdvance = false, index = 0) {
    return BillingService.generateMonthlyBill({ tenancyId: leases[index], createdById: owner, billingPeriodStart: philippineDate(month + '-01'), billingPeriodEnd: philippineDate(month + '-31', true), dueDate: philippineDate(month + '-31', true), applyAdvance }, owner);
  }
  function cash(billId: string, amount: number) { return PaymentService.recordPayment({ billId, amount, paymentDate: date, paymentMethod: 'CASH', recordedById: owner, idempotencyKey: randomUUID() }, owner); }

  test('agreed deposits are not presumed received and target edits do not affect bills', async () => {
    let summary = await Funds.getSummary(leases[0], owner);
    expect(summary.expectedDeposit).toBe('5000.00'); expect(summary.deposit).toBe('0.00');
    await Funds.setDepositTarget(leases[0], owner, 7500.25);
    summary = await Funds.getSummary(leases[0], users[2]);
    expect(summary.expectedDeposit).toBe('7500.25'); expect(summary.deposit).toBe('0.00');
    expect((await bill()).totalAmount.toFixed(2)).toBe('1100.25');
    await Funds.setDepositTarget(leases[0], owner, 0);
    expect((await Funds.getSummary(leases[0], owner)).expectedDeposit).toBe('0.00');
  });

  test('deposits cannot pay monthly rent or inflate collections', async () => {
    await receive('DEPOSIT_RECEIVED', 5000);
    const row = await bill('2030-01', true);
    expect(row.amountPaid.toFixed(2)).toBe('0.00');
    expect((await Funds.getSummary(leases[0], owner)).deposit).toBe('5000.00');
    expect((await PropertyService.getDashboardStats(owner)).collectedThisMonth).toBe(0);
    await expect(Funds.applyAdvance(row.id, owner, 100, randomUUID())).rejects.toThrow('exceeds');
  });

  test('refunds and justified deductions reduce deposits without touching advances', async () => {
    await receive('DEPOSIT_RECEIVED', 5000.25); await receive('ADVANCE_RECEIVED', 1000);
    await receive('DEPOSIT_REFUNDED', 1000); await receive('DEPOSIT_DEDUCTED', 500.25);
    const result = await Funds.getSummary(leases[0], owner);
    expect(result.deposit).toBe('3500.00'); expect(result.advance).toBe('1000.00');
    await expect(receive('DEPOSIT_REFUNDED', 3500.01)).rejects.toThrow('available');
    await expect(Funds.record(leases[0], owner, { ...entry('DEPOSIT_DEDUCTED', 1), notes: '' })).rejects.toThrow('reason');
  });

  test('recording advances never silently pays existing bills', async () => {
    const row = await bill(); await receive('ADVANCE_RECEIVED', 2500);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: row.id } })).amountPaid.toFixed(2)).toBe('0.00');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('2500.00');
    expect((await bill('2030-03')).amountPaid.toFixed(2)).toBe('0.00');
  });

  test('explicit applications support partial coverage, carry-forward, and exact centavos', async () => {
    await receive('ADVANCE_RECEIVED', 2500);
    const first = await bill('2030-01', true), second = await bill('2030-03', true), third = await bill('2030-05', true);
    expect(first.amountPaid.toFixed(2)).toBe('1100.25'); expect(first.status).toBe('PAID');
    expect(second.amountPaid.toFixed(2)).toBe('1100.25');
    expect(third.amountPaid.toFixed(2)).toBe('299.50'); expect(third.status).toBe('PARTIALLY_PAID');
    expect(new Decimal(third.totalAmount).minus(third.amountPaid).toFixed(2)).toBe('800.75');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('0.00');
    expect(first.items.find(item => item.itemType === 'RENT')?.amount.toFixed(2)).toBe('1000.00');
  });

  test('applications are capped at the bill balance and cannot overdraw credit', async () => {
    await receive('ADVANCE_RECEIVED', 2000); const row = await bill(); await cash(row.id, 1000);
    await expect(Funds.applyAdvance(row.id, owner, 100.26, randomUUID())).rejects.toThrow('exceeds');
    await Funds.applyAdvance(row.id, owner, 100.25, randomUUID());
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('PAID');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('1899.75');
  });

  test('repeated ledger and application submissions are idempotent', async () => {
    const input = entry('ADVANCE_RECEIVED', 2000);
    const receipts = await Promise.all([Funds.record(leases[0], owner, input), Funds.record(leases[0], owner, input)]);
    expect(receipts[0].id).toBe(receipts[1].id);
    const row = await bill(), key = randomUUID();
    const applied = await Promise.all([Funds.applyAdvance(row.id, owner, 500, key), Funds.applyAdvance(row.id, owner, 500, key)]);
    expect(applied[0]!.id).toBe(applied[1]!.id);
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('1500.00');
    await expect(Funds.record(leases[0], owner, { ...input, amount: 1000 })).rejects.toThrow('already been used');
    await expect(Funds.applyAdvance(row.id, owner, 501, key)).rejects.toThrow('already been used');
  });

  test('two concurrent bills cannot spend the same advance twice', async () => {
    await receive('ADVANCE_RECEIVED', 1000);
    const one = await bill(), two = await bill('2030-03');
    const result = await Promise.allSettled([Funds.applyAdvance(one.id, owner, 800, randomUUID()), Funds.applyAdvance(two.id, owner, 800, randomUUID())]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('200.00');
  });

  test('parallel generation with application enabled reconciles to the original credit', async () => {
    await receive('ADVANCE_RECEIVED', 1500);
    const result = await Promise.all([bill('2030-01', true), bill('2030-03', true)]);
    expect(result.reduce((sum, row) => sum.plus(row.amountPaid), new Decimal(0)).toFixed(2)).toBe('1500.00');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('0.00');
  });

  test('refund and application race cannot overdraw the tenant balance', async () => {
    await receive('ADVANCE_RECEIVED', 1000); const row = await bill();
    const result = await Promise.allSettled([receive('ADVANCE_REFUNDED', 800), Funds.applyAdvance(row.id, owner, 800, randomUUID())]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('200.00');
  });

  test('concurrent Cash and advance applications cannot overpay one bill', async () => {
    await receive('ADVANCE_RECEIVED', 1000); const row = await bill();
    const result = await Promise.allSettled([cash(row.id, 600), Funds.applyAdvance(row.id, owner, 600, randomUUID())]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: row.id } })).amountPaid.toFixed(2)).toBe('600.00');
  });

  test('voiding an application restores credit and reopens the bill without creating a new receipt', async () => {
    await receive('ADVANCE_RECEIVED', 2000); const row = await bill();
    const applied = await Funds.applyAdvance(row.id, owner, 1100.25, randomUUID());
    expect(await ReceiptService.getForUser(applied!.id, users[2])).toBeNull();
    expect(await prisma.paymentReceipt.count({ where: { paymentId: applied!.id } })).toBe(0);
    await PaymentService.voidPayment(applied!.id, 'Correct allocation', owner);
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('2000.00');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: row.id } })).amountPaid.toFixed(2)).toBe('0.00');
    await BillingService.cancelBill(row.id, owner);
    await expect(Funds.applyAdvance(row.id, owner, 100, randomUUID())).rejects.toThrow('cancelled');
  });

  test('received funds cannot be voided after spending; reverse downstream entries first', async () => {
    const receipt = await receive('ADVANCE_RECEIVED', 1000); const row = await bill();
    const applied = await Funds.applyAdvance(row.id, owner, 500, randomUUID());
    await expect(Funds.voidEntry(receipt.id, owner, 'Wrong entry')).rejects.toThrow('available');
    await PaymentService.voidPayment(applied!.id, 'Wrong allocation', owner);
    await Funds.voidEntry(receipt.id, owner, 'Wrong entry');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('0.00');
    const deposit = await receive('DEPOSIT_RECEIVED', 1000), refund = await receive('DEPOSIT_REFUNDED', 500);
    await expect(Funds.voidEntry(deposit.id, owner, 'Wrong deposit')).rejects.toThrow('available');
    await Funds.voidEntry(refund.id, owner, 'Refund was not made');
    await Funds.voidEntry(deposit.id, owner, 'Wrong deposit');
    expect((await Funds.getSummary(leases[0], owner)).deposit).toBe('0.00');
  });

  test('collections count advances once, deduct refunds, and exclude deposits and allocations', async () => {
    await receive('DEPOSIT_RECEIVED', 5000); await receive('ADVANCE_RECEIVED', 1200);
    const row = await bill(); await Funds.applyAdvance(row.id, owner, 500, randomUUID()); await cash(row.id, 100);
    expect((await PropertyService.getDashboardStats(owner)).collectedThisMonth).toBe(1300);
    await receive('ADVANCE_REFUNDED', 200); await receive('DEPOSIT_REFUNDED', 1000);
    expect((await PropertyService.getDashboardStats(owner)).collectedThisMonth).toBe(1100);
  });

  test('GCash references cannot cross ledgers, be reused after voiding, or race bill recording', async () => {
    const ref = randomUUID().toUpperCase(), row = await bill();
    const input = { ...entry('ADVANCE_RECEIVED', 500), paymentMethod: 'GCASH' as const, referenceNumber: ref };
    const outcomes = await Promise.allSettled([Funds.record(leases[0], owner, input), PaymentService.recordPayment({ billId: row.id, amount: 500, paymentDate: date, paymentMethod: 'GCASH', referenceNumber: ref, recordedById: owner, idempotencyKey: randomUUID() }, owner)]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const recorded = await prisma.tenantFundEntry.findFirst({ where: { tenancyId: leases[0], referenceNumber: ref } });
    if (recorded) await Funds.voidEntry(recorded.id, owner, 'Test reversal');
    else {
      const payment = await prisma.payment.findFirstOrThrow({ where: { billId: row.id, referenceNumber: ref } });
      await PaymentService.voidPayment(payment.id, 'Test reversal', owner);
    }
    await expect(Funds.record(leases[0], owner, { ...input, idempotencyKey: randomUUID() })).rejects.toThrow('already been recorded');
  });

  test('GCash ledger receipts need references and advance cannot be forged as direct cash', async () => {
    await expect(Funds.record(leases[0], owner, { ...entry('ADVANCE_RECEIVED', 100), paymentMethod: 'GCASH' })).rejects.toThrow('reference');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('0.00');
    const row = await bill();
    await expect(PaymentService.recordPayment({ billId: row.id, amount: 100, paymentDate: date,
      paymentMethod: 'ADVANCE' as 'CASH', recordedById: owner, idempotencyKey: randomUUID() }, owner)).rejects.toThrow('Invalid payment method');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: row.id } })).amountPaid.toFixed(2)).toBe('0.00');
  });

  test('tenants and other landlords cannot write or inspect another tenant ledger', async () => {
    await receive('DEPOSIT_RECEIVED', 500);
    await expect(Funds.record(leases[0], outsider, entry('ADVANCE_RECEIVED', 100))).rejects.toThrow('FORBIDDEN');
    await expect(Funds.record(leases[0], users[2], entry('ADVANCE_RECEIVED', 100))).rejects.toThrow('FORBIDDEN');
    await expect(Funds.getSummary(leases[0], users[3])).rejects.toThrow('FORBIDDEN');
    await expect(Funds.getSummary(leases[0], outsider)).rejects.toThrow('FORBIDDEN');
    const row = await bill();
    await expect(Funds.applyAdvance(row.id, outsider, 100, randomUUID())).rejects.toThrow('FORBIDDEN');
    expect((await Funds.getSummary(leases[0], users[2])).deposit).toBe('500.00');
    expect((await Funds.getSummary(leases[1], users[3])).deposit).toBe('0.00');
  });

  test('one tenant advance cannot settle another tenant bill owned by the same landlord', async () => {
    await receive('ADVANCE_RECEIVED', 1000);
    const otherBill = await bill('2030-01', false, 1);
    await expect(Funds.applyAdvance(otherBill.id, owner, 500, randomUUID())).rejects.toThrow('exceeds');
    expect((await Funds.getSummary(leases[0], owner)).advance).toBe('1000.00');
    expect((await Funds.getSummary(leases[1], owner)).advance).toBe('0.00');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: otherBill.id } })).amountPaid.toFixed(2)).toBe('0.00');
  });

  test('move-out preserves deposits and advances for refunds or final existing bills', async () => {
    await receive('DEPOSIT_RECEIVED', 5000); await receive('ADVANCE_RECEIVED', 2000); const row = await bill();
    await TenantService.endTenancy(leases[0], owner);
    await expect(receive('ADVANCE_RECEIVED', 100)).rejects.toThrow('active tenancy');
    await Funds.applyAdvance(row.id, owner, 1000, randomUUID());
    await receive('ADVANCE_REFUNDED', 1000); await receive('DEPOSIT_REFUNDED', 5000);
    const result = await Funds.getSummary(leases[0], users[2]);
    expect(result.deposit).toBe('0.00'); expect(result.advance).toBe('0.00'); expect(result.entries).toHaveLength(4);
  });

  test('fully covered bills do not receive unpaid reminders', async () => {
    await receive('ADVANCE_RECEIVED', 1100.25); const row = await bill('2030-01', true);
    expect((await ReminderService.send(row.id, owner)).sent).toBe(false);
    expect((await ReminderService.runDue(philippineDate('2031-01-01'), propertyId)).sent).toBe(0);
    expect(await prisma.notification.count({ where: { userId: users[2], type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] } } })).toBe(0);
  });
});
