import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { File } from 'node:buffer';
import sharp from 'sharp';
import { prisma } from '@/lib/db/prisma';
import { PaymentProofService as Proofs, proofSummarySelect } from '@/services/billing/payment-proof.service';
import { PaymentService } from '@/services/billing/payment.service';
import { ReceiptService } from '@/services/billing/receipt.service';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Tenant GCash evidence and confirmed-only accounting', () => {
  let users: string[], owner: string, tenant: string, outsider: string, propertyId: string, tenancyId: string, billId: string, image: Buffer;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    image = await sharp({ create: { width: 80, height: 120, channels: 3, background: '#eeeeee' } }).png().toBuffer();
  });
  beforeEach(async () => {
    users = [];
    for (const role of ['LANDLORD', 'TENANT', 'LANDLORD', 'TENANT'] as const) users.push((await prisma.user.create({ data: { name: 'Proof fixture ' + randomUUID(), role, passwordHash: 'fixture-only' } })).id);
    [owner, tenant, outsider] = users;
    const property = await prisma.property.create({ data: { landlordId: owner, name: 'Proof fixture', address: 'Test only', rooms: { create: { roomNumber: '101', monthlyRent: 1000 } } }, include: { rooms: true } });
    propertyId = property.id;
    tenancyId = (await prisma.tenancy.create({ data: { tenantId: tenant, propertyId, roomId: property.rooms[0].id, startDate: new Date('2026-01-01'), monthlyRent: 1000, status: 'ACTIVE' } })).id;
    billId = (await prisma.bill.create({ data: { tenancyId, propertyId, createdById: owner, billingPeriodStart: new Date('2026-10-01'), billingPeriodEnd: new Date('2026-10-31'), dueDate: new Date('2030-10-31'), totalAmount: 1000 } })).id;
  });
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.paymentProof.deleteMany({ where: { bill: { propertyId } } });
    await prisma.payment.deleteMany({ where: { bill: { propertyId } } });
    await prisma.bill.deleteMany({ where: { propertyId } });
    await prisma.tenantFundEntry.deleteMany({ where: { tenancyId } });
    await prisma.tenancy.deleteMany({ where: { propertyId } });
    await prisma.room.deleteMany({ where: { propertyId } });
    await prisma.property.delete({ where: { id: propertyId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });
  afterAll(async () => prisma.$disconnect());
  function input(amount = '1000') { return { amount, paymentDate: new Date(Date.now() - 60000), referenceNumber: 'TEST-' + randomUUID(), idempotencyKey: randomUUID(), file: new File([image], 'proof.png', { type: 'image/png' }) as unknown as globalThis.File }; }
  function cash(amount: number) { return PaymentService.recordPayment({ billId, amount, paymentDate: new Date(), paymentMethod: 'CASH', recordedById: owner }, owner); }
  async function row() { return prisma.bill.findUniqueOrThrow({ where: { id: billId } }); }

  test('pending proof never creates a payment, receipt, reserved reference or paid balance', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00'); expect((await row()).status).toBe('PENDING');
    expect(await prisma.payment.count({ where: { billId } })).toBe(0);
    expect(await prisma.moneyReference.count({ where: { ownerId: owner } })).toBe(0);
    expect(await ReceiptService.getForUser(id, tenant)).toBeNull();
    expect(await prisma.notification.count({ where: { userId: owner, type: 'PAYMENT_PROOF_SUBMITTED' } })).toBe(1);
    const list = await prisma.paymentProof.findUniqueOrThrow({ where: { id }, select: proofSummarySelect });
    expect(list).not.toHaveProperty('image'); expect(list).not.toHaveProperty('idempotencyKey');
  });
  test('approval creates one confirmed GCash payment and receipt atomically', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    const paymentId = await Proofs.review(id, owner, 'APPROVE', true);
    expect((await row()).status).toBe('PAID'); expect((await row()).amountPaid.toFixed(2)).toBe('1000.00');
    expect(await ReceiptService.getForUser(paymentId!, tenant)).not.toBeNull();
    expect(await ReceiptService.getForUser(paymentId!, outsider)).toBeNull();
    const proof = await prisma.paymentProof.findUniqueOrThrow({ where: { id } });
    expect(proof.status).toBe('APPROVED'); expect(proof.reviewedById).toBe(owner); expect(proof.pendingBillId).toBeNull();
  });
  test('concurrent approval retries create only one payment and receipt', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    const results = await Promise.all([Proofs.review(id, owner, 'APPROVE', true), Proofs.review(id, owner, 'APPROVE', true)]);
    expect(results[0]).toBe(results[1]); expect(await prisma.payment.count({ where: { billId } })).toBe(1);
    expect(await prisma.paymentReceipt.count({ where: { payment: { billId } } })).toBe(1);
  });
  test('rejection retains a reason, creates no money and allows corrected submission', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    await expect(Proofs.review(id, owner, 'REJECT', false, '')).rejects.toThrow('reason');
    await Proofs.review(id, owner, 'REJECT', false, 'Reference not found');
    await Proofs.review(id, owner, 'REJECT', false, 'Reference not found');
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
    await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow('already');
    await expect(Proofs.submit(billId, tenant, input())).resolves.toBeTruthy();
  });
  test('approval requires received confirmation and property ownership', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    await expect(Proofs.review(id, owner, 'APPROVE', false)).rejects.toThrow('Confirm');
    for (const actor of [outsider, tenant, users[3]]) await expect(Proofs.review(id, actor, 'APPROVE', true)).rejects.toThrow('not available');
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
  });
  test('only own tenant can submit and only own tenant/landlord can view image', async () => {
    for (const actor of [owner, outsider, users[3]]) await expect(Proofs.submit(billId, actor, input())).rejects.toThrow('not available');
    const id = await Proofs.submit(billId, tenant, input());
    for (const actor of [owner, tenant]) expect((await Proofs.imageForUser(id, actor))?.image.length).toBeGreaterThan(0);
    for (const actor of [outsider, users[3]]) expect(await Proofs.imageForUser(id, actor)).toBeNull();
  });
  test('submission retries are idempotent; conflicting pending proofs cannot accumulate', async () => {
    const data = input();
    const ids = await Promise.all([Proofs.submit(billId, tenant, data), Proofs.submit(billId, tenant, data)]);
    expect(ids[0]).toBe(ids[1]);
    await expect(Proofs.submit(billId, tenant, { ...data, amount: '500' })).rejects.toThrow('already been used');
    await expect(Proofs.submit(billId, tenant, input())).rejects.toThrow('already awaiting');
  });
  test('partial payment leaves exact remaining balance and gets only its own receipt', async () => {
    const id = await Proofs.submit(billId, tenant, input('100.25'));
    const paymentId = await Proofs.review(id, owner, 'APPROVE', true);
    expect((await row()).amountPaid.toFixed(2)).toBe('100.25'); expect((await row()).status).toBe('PARTIALLY_PAID');
    expect((await ReceiptService.getForUser(paymentId!, tenant))?.amount).toBe('100.25');
  });
  test('updated balances and cancelled bills prevent stale proof approvals without altering evidence', async () => {
    const id = await Proofs.submit(billId, tenant, input()); await cash(100);
    await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow();
    expect((await row()).amountPaid.toFixed(2)).toBe('100.00');
    await prisma.bill.update({ where: { id: billId }, data: { cancelledAt: new Date(), status: 'CANCELLED' } });
    await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow('cancelled');
    expect((await prisma.paymentProof.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    await Proofs.review(id, owner, 'REJECT', false, 'Bill cancelled');
  });
  test('concurrent direct payment and approval cannot overpay', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    const results = await Promise.allSettled([cash(1000), Proofs.review(id, owner, 'APPROVE', true)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await row()).amountPaid.toFixed(2)).toBe('1000.00');
    expect(await prisma.payment.count({ where: { billId } })).toBe(1);
  });
  test('unverified references never block actual GCash receipts, then cannot be credited twice', async () => {
    const data = input(), id = await Proofs.submit(billId, tenant, data);
    await TenantFundsService.record(tenancyId, owner, { kind: 'DEPOSIT_RECEIVED', amount: 1000, paymentMethod: 'GCASH', paymentDate: data.paymentDate, referenceNumber: data.referenceNumber, idempotencyKey: randomUUID() });
    await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow();
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
    expect(await prisma.paymentReceipt.count({ where: { payment: { billId } } })).toBe(0);
    expect((await prisma.paymentProof.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  });
  test('voided approval loses receipt access and cannot be approved a second time', async () => {
    const id = await Proofs.submit(billId, tenant, input()); const paymentId = await Proofs.review(id, owner, 'APPROVE', true);
    await PaymentService.voidPayment(paymentId!, 'Incorrect verification', owner);
    expect(await ReceiptService.getForUser(paymentId!, tenant)).toBeNull();
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
    await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow('already');
  });
  test('invalid amount, date, reference and already-paid bill submissions are rejected', async () => {
    for (const amount of ['0', '-1', '1000.01', 'NaN', '0.001']) await expect(Proofs.submit(billId, tenant, input(amount))).rejects.toThrow();
    await expect(Proofs.submit(billId, tenant, { ...input(), paymentDate: new Date(Date.now() + 86400000) })).rejects.toThrow('future');
    await expect(Proofs.submit(billId, tenant, { ...input(), referenceNumber: '<script>' })).rejects.toThrow();
    await cash(1000); await expect(Proofs.submit(billId, tenant, input())).rejects.toThrow('balance');
  });

  test('receipt failure rolls back proof approval, reference reservation, payment and bill updates', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    const fail = jest.spyOn(ReceiptService, 'snapshot').mockRejectedValueOnce(new Error('Test receipt failure'));
    try { await expect(Proofs.review(id, owner, 'APPROVE', true)).rejects.toThrow('Test receipt failure'); } finally { fail.mockRestore(); }
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
    expect(await prisma.payment.count({ where: { billId } })).toBe(0);
    expect(await prisma.moneyReference.count({ where: { ownerId: owner } })).toBe(0);
    expect((await prisma.paymentProof.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    await expect(Proofs.review(id, owner, 'APPROVE', true)).resolves.toBeTruthy();
  });

  test('shared submission limits prevent repeated processing attempts', async () => {
    for (let i = 0; i < 10; i++) await expect(Proofs.submit(billId, tenant, input('0'))).rejects.toThrow('valid');
    await expect(Proofs.submit(billId, tenant, input())).rejects.toThrow('Too many');
    expect(await prisma.paymentProof.count({ where: { billId } })).toBe(0);
  });

  test('dashboard queue is owner-scoped and omits private screenshots and references', async () => {
    const id = await Proofs.submit(billId, tenant, input('100.25'));
    const queue = await Proofs.getPendingForLandlord(owner);
    expect(queue.total).toBe(1); expect(queue.proofs[0].id).toBe(id);
    expect(queue.proofs[0].amount.toFixed(2)).toBe('100.25');
    expect(queue.proofs[0].bill.tenancy.room.roomNumber).toBe('101');
    expect(queue.proofs[0]).not.toHaveProperty('image'); expect(queue.proofs[0]).not.toHaveProperty('imageHash');
    expect(queue.proofs[0]).not.toHaveProperty('referenceNumber'); expect(queue.proofs[0]).not.toHaveProperty('idempotencyKey');
    for (const actor of [outsider, tenant, users[3]]) expect((await Proofs.getPendingForLandlord(actor)).total).toBe(0);
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
  });

  test('dashboard removes confirmed and declined proofs and shows corrected submissions', async () => {
    const first = await Proofs.submit(billId, tenant, input('100'));
    await Proofs.review(first, owner, 'REJECT', false, 'Reference not found');
    expect((await Proofs.getPendingForLandlord(owner)).total).toBe(0);
    const corrected = await Proofs.submit(billId, tenant, input('100'));
    expect((await Proofs.getPendingForLandlord(owner)).proofs[0].id).toBe(corrected);
    await Proofs.review(corrected, owner, 'APPROVE', true);
    expect((await Proofs.getPendingForLandlord(owner)).total).toBe(0);
  });

  test('dashboard retains unresolved claims after cash payment, cancellation, or property archival', async () => {
    const id = await Proofs.submit(billId, tenant, input());
    await cash(1000);
    let queue = await Proofs.getPendingForLandlord(owner);
    expect(queue.proofs[0].id).toBe(id); expect(queue.proofs[0].bill.status).toBe('PAID');
    await prisma.bill.update({ where: { id: billId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await prisma.property.update({ where: { id: propertyId }, data: { archivedAt: new Date() } });
    queue = await Proofs.getPendingForLandlord(owner);
    expect(queue.total).toBe(1); expect(queue.proofs[0].bill.cancelledAt).not.toBeNull();
    await Proofs.review(id, owner, 'REJECT', false, 'Already recorded separately');
    expect((await Proofs.getPendingForLandlord(owner)).total).toBe(0);
  });

  test('dashboard pagination is oldest-first with stable ties and clamps invalid or emptied pages', async () => {
    const bill = await row();
    const createdAt = new Date('2026-10-01');
    for (let i = 6; i >= 0; i--) {
      const id = randomUUID();
      await prisma.bill.create({ data: { id, propertyId, tenancyId, createdById: owner, totalAmount: 1000, billingPeriodStart: bill.billingPeriodStart, billingPeriodEnd: bill.billingPeriodEnd, dueDate: bill.dueDate } });
      await prisma.paymentProof.create({ data: { id: `queue-${i}-${randomUUID()}`, billId: id, amount: 100, paymentDate: new Date(), referenceNumber: 'Fixture only', image, imageHash: '0'.repeat(64), idempotencyKey: randomUUID(), pendingBillId: id, createdAt } });
    }
    const first = await Proofs.getPendingForLandlord(owner), second = await Proofs.getPendingForLandlord(owner, 2);
    expect(first.total).toBe(7); expect(first.pages).toBe(2); expect(first.proofs).toHaveLength(5); expect(second.proofs).toHaveLength(2);
    const ids = [...first.proofs, ...second.proofs].map(p => p.id);
    expect(ids).toEqual([...ids].sort()); expect(new Set(ids).size).toBe(7);
    for (const invalid of [0, -1, NaN, Infinity, 1.5]) expect((await Proofs.getPendingForLandlord(owner, invalid)).page).toBe(1);
    expect((await Proofs.getPendingForLandlord(owner, 999999)).page).toBe(2);
    await prisma.paymentProof.updateMany({ where: { id: { in: second.proofs.map(p => p.id) } }, data: { status: 'REJECTED', pendingBillId: null } });
    expect((await Proofs.getPendingForLandlord(owner, 2)).page).toBe(1);
  });
  test('history pages include corrections, stay owner scoped and preserve all records across tied dates', async () => {
    const date = new Date('2026-10-01');
    await prisma.payment.createMany({ data: Array.from({ length: 45 }, (_, index) => ({
      id: 'history-' + String(index).padStart(3, '0') + '-' + randomUUID(), billId, tenancyId,
      amount: 1, paymentDate: date, paymentMethod: 'CASH', recordedById: owner,
      confirmedAt: date, ...(index === 44 ? { voidedAt: date, voidReason: 'Duplicate entry corrected' } : {}),
    })) });
    await prisma.bill.update({ where: { id: billId }, data: { amountPaid: 44, status: 'PARTIALLY_PAID' } });
    const first = await PaymentService.getTenantPayments(tenant);
    const second = await PaymentService.getTenantPayments(tenant, 2);
    const last = await PaymentService.getTenantPayments(tenant, 3);
    expect(first.total).toBe(45); expect(first.pages).toBe(3);
    expect(first.payments).toHaveLength(20); expect(second.payments).toHaveLength(20); expect(last.payments).toHaveLength(5);
    const ids = [...first.payments, ...second.payments, ...last.payments].map(row => row.id);
    expect(new Set(ids).size).toBe(45); expect(ids).toEqual([...ids].sort().reverse());
    expect(first.payments[0].voidReason).toBe('Duplicate entry corrected');
    expect(first.payments[0]).not.toHaveProperty('idempotencyKey');
    expect(first.payments[0]).not.toHaveProperty('recordedById');
    expect(first.payments[0]).not.toHaveProperty('notes');
    for (const invalid of [0, -1, NaN, Infinity, 1.5]) expect((await PaymentService.getTenantPayments(tenant, invalid)).page).toBe(1);
    expect((await PaymentService.getTenantPayments(tenant, Number.MAX_SAFE_INTEGER)).page).toBe(3);
    for (const actor of [owner, outsider, users[3]]) expect((await PaymentService.getTenantPayments(actor)).total).toBe(0);
    expect((await row()).amountPaid.toFixed(2)).toBe('44.00');
  });

  test('exact authorized reversal retries succeed without changing the ledger, while conflicts and outsiders fail', async () => {
    const payment = await cash(100);
    await PaymentService.voidPayment(payment.id, 'Duplicate entry corrected', owner);
    const original = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    await expect(PaymentService.voidPayment(payment.id, '  Duplicate entry corrected  ', owner)).resolves.toEqual({ success: true });
    await expect(PaymentService.voidPayment(payment.id, 'A different reason', owner)).rejects.toThrow('different reason');
    await expect(PaymentService.voidPayment(payment.id, 'Duplicate entry corrected', outsider)).rejects.toThrow('FORBIDDEN');
    const retried = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(retried.voidedAt).toEqual(original.voidedAt); expect(retried.voidReason).toBe(original.voidReason);
    expect((await row()).amountPaid.toFixed(2)).toBe('0.00');
    expect(await ReceiptService.getForUser(payment.id, tenant)).toBeNull();
  });

});
