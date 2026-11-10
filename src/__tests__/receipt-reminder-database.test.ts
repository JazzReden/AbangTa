import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { PaymentService } from '@/services/billing/payment.service';
import { ReceiptService } from '@/services/billing/receipt.service';
import { ReminderService } from '@/services/billing/reminder.service';
import { BillingService } from '@/services/billing/billing.service';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('confirmed receipts and unpaid bill reminders (isolated MySQL fixtures)', () => {
  const marker = 'receipts-' + randomUUID();
  const users: string[] = [], bills: string[] = [], leases: string[] = [];
  let propertyId: string, cashId: string, legacyId: string;
  const now = new Date(), day = 86400000;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    for (const role of ['LANDLORD', 'LANDLORD', 'TENANT', 'TENANT'] as const) users.push((await prisma.user.create({ data: { name: marker, email: marker + users.length + '@example.test', passwordHash: 'fixture-only', role } })).id);
    propertyId = (await prisma.property.create({ data: { name: marker, address: 'Original address', landlordId: users[0] } })).id;
    for (let index = 0; index < 2; index++) {
      const room = await prisma.room.create({ data: { propertyId, roomNumber: String(101 + index), monthlyRent: 1000 } });
      const lease = await prisma.tenancy.create({ data: { propertyId, roomId: room.id, tenantId: users[index + 2], startDate: new Date(now.getTime() - 60 * day), monthlyRent: 1000, status: 'ACTIVE' } });
      leases.push(lease.id);
    }
    for (let index = 0; index < 5; index++) bills.push((await prisma.bill.create({ data: {
      tenancyId: leases[index % 2], propertyId, billingPeriodStart: new Date(now.getTime() - 30 * day), billingPeriodEnd: now,
      dueDate: new Date(now.getTime() + (index === 4 ? 10 : index === 0 ? -1 : 2) * day), totalAmount: 1000, createdById: users[0],
    } })).id);
  });
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.payment.deleteMany({ where: { billId: { in: bills } } });
    await prisma.bill.deleteMany({ where: { id: { in: bills } } });
    await prisma.tenancy.deleteMany({ where: { propertyId } });
    await prisma.room.deleteMany({ where: { propertyId } });
    await prisma.property.deleteMany({ where: { id: propertyId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test('recording a confirmed payment atomically creates one immutable receipt on retry', async () => {
    const input = { billId: bills[0], amount: 100.25, paymentDate: now, paymentMethod: 'CASH' as const, recordedById: users[0], idempotencyKey: randomUUID() };
    const payment = await PaymentService.recordPayment(input, users[0]); cashId = payment.id;
    expect(payment.confirmedAt).not.toBeNull();
    await PaymentService.recordPayment(input, users[0]);
    expect(await prisma.paymentReceipt.count({ where: { paymentId: payment.id } })).toBe(1);
    const receipt = await ReceiptService.getForUser(payment.id, users[2]);
    expect(receipt?.amount).toBe('100.25'); expect(receipt?.balance).toBe('899.75');
    await prisma.property.update({ where: { id: propertyId }, data: { name: 'Changed property name' } });
    await prisma.user.update({ where: { id: users[2] }, data: { name: 'Changed tenant name' } });
    expect((await ReceiptService.getForUser(payment.id, users[2]))?.propertyName).toBe(marker);
    expect((await ReceiptService.getForUser(payment.id, users[0]))?.tenantName).toBe(marker);
    expect(await ReceiptService.getForUser(payment.id, users[3])).toBeNull();
    expect(await ReceiptService.getForUser(payment.id, users[1])).toBeNull();
  });

  test('legacy/unconfirmed payments cannot download until the owner confirms; reversals invalidate downloads', async () => {
    const legacy = await prisma.payment.create({ data: { billId: bills[1], tenancyId: leases[1], amount: 50, paymentDate: now, paymentMethod: 'CASH', recordedById: users[0] } }); legacyId = legacy.id;
    await BillingService.recalculateBillStatus(bills[1]);
    expect(await ReceiptService.getForUser(legacy.id, users[3])).toBeNull();
    await expect(ReceiptService.confirmExisting(legacy.id, users[1])).rejects.toThrow('FORBIDDEN');
    await ReceiptService.confirmExisting(legacy.id, users[0]);
    expect((await ReceiptService.getForUser(legacy.id, users[3]))?.amount).toBe('50.00');
    await PaymentService.voidPayment(legacy.id, 'Fixture reversal', users[0]);
    expect(await ReceiptService.getForUser(legacy.id, users[3])).toBeNull();
    await expect(ReceiptService.confirmExisting(legacy.id, users[0])).rejects.toThrow('cannot have a receipt');
  });

  test('GCash confirmation has its own receipt, and concurrent reminders deliver once with the real balance', async () => {
    const gcash = await PaymentService.recordPayment({ billId: bills[0], amount: 99.75, paymentDate: now, paymentMethod: 'GCASH', referenceNumber: marker.toUpperCase(), recordedById: users[0] }, users[0]);
    expect((await ReceiptService.getForUser(gcash.id, users[2]))?.method).toBe('GCASH');
    await expect(ReminderService.send(bills[0], users[1])).rejects.toThrow('FORBIDDEN');
    const results = await Promise.all([ReminderService.send(bills[0], users[0]), ReminderService.send(bills[0], users[0])]);
    expect(results.filter(result => result.sent)).toHaveLength(1);
    const notifications = await prisma.notification.findMany({ where: { userId: users[2], relatedEntityId: bills[0], type: 'RENT_OVERDUE' } });
    expect(notifications).toHaveLength(1); expect(notifications[0].message).toContain('800.00');
    expect((await ReminderService.forTenant(users[2])).some(reminder => reminder.relatedEntityId === bills[0])).toBe(true);
  });

  test('paid/cancelled bills do not get reminders and paid notifications disappear', async () => {
    await PaymentService.recordPayment({ billId: bills[0], amount: 800, paymentDate: now, paymentMethod: 'CASH', recordedById: users[0] }, users[0]);
    expect((await ReminderService.send(bills[0], users[0])).sent).toBe(false);
    expect((await ReminderService.forTenant(users[2])).some(reminder => reminder.relatedEntityId === bills[0])).toBe(false);
    await BillingService.cancelBill(bills[2], users[0]);
    expect((await ReminderService.send(bills[2], users[0])).sent).toBe(false);
  });

  test('scheduled reminders honor due windows and cooldown across repeated job runs', async () => {
    const first = await ReminderService.runDue(now, propertyId);
    expect(first.sent).toBe(1);
    expect((await ReminderService.runDue(now, propertyId)).sent).toBe(0);
    expect(await prisma.notification.count({ where: { relatedEntityId: bills[4], type: { in: ['RENT_DUE_SOON', 'RENT_OVERDUE'] } } })).toBe(0);
    expect((await ReminderService.runDue(new Date(now.getTime() + 25 * 3600000), propertyId)).sent).toBe(1);
    expect(await prisma.paymentReceipt.count({ where: { paymentId: { in: [cashId, legacyId] } } })).toBe(2);
  });
});
