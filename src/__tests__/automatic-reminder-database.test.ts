import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { ReminderService } from '@/services/billing/reminder.service';
import { PaymentService } from '@/services/billing/payment.service';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('automatic reminder anti-spam and paid-bill safety', () => {
  const marker = 'automatic-reminders-' + randomUUID();
  const users: string[] = [], bills: string[] = [];
  let propertyId: string;
  const now = new Date(), day = 86400000;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    for (const role of ['LANDLORD', 'TENANT', 'TENANT'] as const) users.push((await prisma.user.create({ data: { role, name: marker, email: marker + users.length + '@example.test', passwordHash: 'fixture-only' } })).id);
    propertyId = (await prisma.property.create({ data: { name: marker, address: 'Test only', landlordId: users[0] } })).id;
    for (let index = 0; index < 2; index++) {
      const room = await prisma.room.create({ data: { propertyId, roomNumber: String(101 + index), monthlyRent: 1000 } });
      const tenancy = await prisma.tenancy.create({ data: { propertyId, roomId: room.id, tenantId: users[index + 1], monthlyRent: 1000, startDate: new Date(now.getTime() - 90 * day), status: 'ACTIVE' } });
      for (let month = 0; month < 2; month++) bills.push((await prisma.bill.create({ data: { propertyId, tenancyId: tenancy.id, createdById: users[0], totalAmount: 1000, dueDate: new Date(now.getTime() - (month + 1) * day), billingPeriodStart: new Date(now.getTime() - (month + 1) * 30 * day), billingPeriodEnd: new Date(now.getTime() - month * 30 * day) } })).id);
    }
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
  async function clearFixtureCooldowns() {
    await prisma.user.updateMany({ where: { id: { in: users.slice(1) } }, data: { lastBillReminderAt: null } });
    await prisma.bill.updateMany({ where: { id: { in: bills } }, data: { lastReminderAt: null } });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  }

  test('different bills for the same tenant cannot both send concurrently', async () => {
    const results = await Promise.all([ReminderService.send(bills[0], users[0]), ReminderService.send(bills[1], users[0])]);
    expect(results.filter(result => result.sent)).toHaveLength(1);
    expect(await prisma.notification.count({ where: { userId: users[1], type: { in: ['RENT_OVERDUE', 'RENT_DUE_SOON'] } } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: users[1] } })).lastBillReminderAt).not.toBeNull();
  });

  test('repeated/concurrent automatic batches send at most once per tenant per 24 hours', async () => {
    await clearFixtureCooldowns();
    const batches = await Promise.all([ReminderService.runDue(now, propertyId), ReminderService.runDue(now, propertyId)]);
    expect(batches.reduce((sum, batch) => sum + batch.sent, 0)).toBe(2);
    expect((await ReminderService.runDue(new Date(now.getTime() + day - 1), propertyId)).sent).toBe(0);
    expect((await ReminderService.runDue(new Date(now.getTime() + day), propertyId)).sent).toBe(2);
    for (const tenantId of users.slice(1)) {
      expect(await prisma.notification.count({ where: { userId: tenantId, isRead: false, type: { in: ['RENT_OVERDUE', 'RENT_DUE_SOON'] } } })).toBe(1);
    }
  });

  test('a payment racing a reminder leaves no active reminder for the paid bill', async () => {
    await clearFixtureCooldowns();
    await Promise.all([
      PaymentService.recordPayment({ billId: bills[0], amount: 1000, paymentDate: now, paymentMethod: 'CASH', recordedById: users[0] }, users[0]),
      ReminderService.send(bills[0], users[0]),
    ]);
    expect((await ReminderService.send(bills[0], users[0])).sent).toBe(false);
    expect((await ReminderService.forTenant(users[1])).some(reminder => reminder.relatedEntityId === bills[0])).toBe(false);
    expect(await prisma.notification.count({ where: { relatedEntityId: bills[0], isRead: false, type: { in: ['RENT_OVERDUE', 'RENT_DUE_SOON'] } } })).toBe(0);
  });

  test('paid/cancelled statuses and fully received money are excluded even if cached totals drift', async () => {
    await clearFixtureCooldowns();
    await prisma.bill.update({ where: { id: bills[1] }, data: { status: 'PAID', amountPaid: 0 } });
    await prisma.bill.update({ where: { id: bills[2] }, data: { status: 'CANCELLED' } });
    await prisma.bill.update({ where: { id: bills[0] }, data: { status: 'PENDING', amountPaid: 0 } });
    const result = await ReminderService.runDue(now, propertyId);
    expect(result.sent).toBe(1);
    for (const id of bills.slice(0, 3)) expect((await ReminderService.send(id, users[0])).sent).toBe(false);
    expect(await prisma.notification.count({ where: { relatedEntityId: { in: bills.slice(0, 3) }, type: { in: ['RENT_OVERDUE', 'RENT_DUE_SOON'] } } })).toBe(0);
  });
});
