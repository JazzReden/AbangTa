import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { googleAccount } from '@/lib/auth/google-account';
import { BillingService } from '@/services/billing/billing.service';
import { PaymentService } from '@/services/billing/payment.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import type { AuthIntent } from '@/lib/auth/intent';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Google role/linking and additional billing database integrity', () => {
  const marker = 'google-billing-' + randomUUID();
  const userIds: string[] = [];
  let owner: string, tenant: string, propertyId: string, tenancyId: string, billId: string;
  const intent = (role: 'LANDLORD' | 'TENANT', patch: Partial<AuthIntent> = {}): AuthIntent => ({ role, mode: 'register', returnTo: '/onboarding', expiresAt: Date.now() + 60000, ...patch });
  const profile = (suffix: string) => ({ email: `${marker}-${suffix}@example.test`, sub: marker + suffix, name: 'Google fixture', email_verified: true });

  beforeAll(() => { loadEnvConfig(process.cwd()); });
  afterAll(async () => {
    if (propertyId) {
      await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.payment.deleteMany({ where: { tenancy: { propertyId } } });
      await prisma.bill.deleteMany({ where: { propertyId } });
      await prisma.tenancy.deleteMany({ where: { propertyId } });
      await prisma.room.deleteMany({ where: { propertyId } });
      await prisma.utilityConfig.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  test('verified Google registration creates the correct profile for both roles', async () => {
    for (const role of ['LANDLORD', 'TENANT'] as const) {
      const user = await googleAccount(profile(role), intent(role), true);
      expect(user?.role).toBe(role);
      userIds.push(user!.id);
      if (role === 'LANDLORD') owner = user!.id; else tenant = user!.id;
      const saved = await prisma.user.findUniqueOrThrow({ where: { id: user!.id }, include: { landlordProfile: true, tenantProfile: true } });
      expect(role === 'LANDLORD' ? saved.landlordProfile : saved.tenantProfile).not.toBeNull();
      expect((await googleAccount(profile(role), intent(role, { mode: 'signin' }), true))?.id).toBe(user!.id);
    }
    await expect(googleAccount(profile('TENANT'), intent('LANDLORD', { mode: 'signin' }), true)).rejects.toThrow('wrong-role');
    await expect(googleAccount({ ...profile('x'), email_verified: false }, intent('TENANT'), true)).rejects.toThrow();
  });

  test('password account linking requires the matching authenticated account', async () => {
    const local = await prisma.user.create({ data: { email: profile('local').email, name: marker, role: 'TENANT', passwordHash: '$2b$12$test-only' } });
    userIds.push(local.id);
    await expect(googleAccount(profile('local'), intent('TENANT', { mode: 'signin' }), true)).rejects.toThrow('password-first');
    await expect(googleAccount(profile('LANDLORD'), intent('TENANT', { mode: 'signin', linkUserId: local.id }), true)).rejects.toThrow('identity-mismatch');
    expect((await googleAccount(profile('local'), intent('TENANT', { mode: 'signin', linkUserId: local.id }), true))?.id).toBe(local.id);
    await expect(googleAccount({ ...profile('local'), sub: marker + 'replacement' }, intent('TENANT', { mode: 'signin', linkUserId: local.id }), true)).rejects.toThrow('identity-mismatch');
  });

  test('Wi-Fi, free parking and included custom charges persist as exact bill snapshots', async () => {
    const property = await prisma.property.create({ data: { name: marker, address: 'Test only', landlordId: owner, rooms: { create: { roomNumber: '101', monthlyRent: 1000, capacity: 1 } }, utilityConfigs: { create: [
      { utilityType: 'WATER', billingMethod: 'INCLUDED' }, { utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' },
    ] } }, include: { rooms: true } });
    propertyId = property.id;
    const tenancy = await prisma.tenancy.create({ data: { propertyId, roomId: property.rooms[0].id, tenantId: tenant, startDate: philippineDate('2026-01-01'), monthlyRent: 1000, status: 'ACTIVE', parkingMode: 'FREE' } });
    tenancyId = tenancy.id;
    const bill = await BillingService.generateMonthlyBill({ tenancyId, createdById: owner, billingPeriodStart: philippineDate('2026-10-01'), billingPeriodEnd: philippineDate('2026-10-31', true), dueDate: philippineDate('2026-11-01'), additionalCharges: [
      { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 200.25 },
      { itemType: 'PARKING', description: 'Parking', treatment: 'FREE', amount: 0 },
      { itemType: 'OTHER', description: 'Laundry', treatment: 'INCLUDED', amount: 0 },
    ] }, owner);
    billId = bill.id;
    expect(bill.totalAmount.toFixed(2)).toBe('1200.25');
    expect(bill.items.find(item => item.itemType === 'PARKING')?.chargeTreatment).toBe('FREE');
    expect(bill.items.find(item => item.description === 'Laundry')?.isIncluded).toBe(true);
  });

  test('mobile-only accounts attach Google without creating a second tenant account', async () => {
    const local = await prisma.user.create({ data: { name: marker, role: 'TENANT', passwordHash: '$2b$12$test-only' } });
    userIds.push(local.id);
    const linked = await googleAccount(profile('mobile'), intent('TENANT', { mode: 'signin', linkUserId: local.id }), true);
    expect(linked?.id).toBe(local.id);
    expect(linked?.email).toBe(profile('mobile').email);
    expect(linked?.googleSubject).toBe(profile('mobile').sub);
  });

  test('repeated Cash submission records one payment, then GCash validates and deduplicates references', async () => {
    const input = { billId, amount: 100, paymentDate: philippineDate('2026-10-15'), paymentMethod: 'CASH' as const, recordedById: owner, idempotencyKey: randomUUID() };
    const payments = await Promise.all([PaymentService.recordPayment(input, owner), PaymentService.recordPayment(input, owner)]);
    expect(payments[0].id).toBe(payments[1].id);
    await expect(PaymentService.recordPayment({ ...input, amount: 200 }, owner)).rejects.toThrow('already been used');
    await expect(PaymentService.recordPayment({ ...input, idempotencyKey: randomUUID() }, tenant)).rejects.toThrow('FORBIDDEN');
    const gcash = { ...input, amount: 200, paymentMethod: 'GCASH' as const, idempotencyKey: randomUUID(), referenceNumber: marker.toUpperCase() };
    await PaymentService.recordPayment(gcash, owner);
    await expect(PaymentService.recordPayment({ ...gcash, idempotencyKey: randomUUID() }, owner)).rejects.toThrow('already been recorded');
    await expect(PaymentService.recordPayment({ ...gcash, referenceNumber: '', idempotencyKey: randomUUID() }, owner)).rejects.toThrow('reference');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: billId } })).amountPaid.toFixed(2)).toBe('300.00');
    expect(await prisma.notification.count({ where: { userId: tenant, type: 'PAYMENT_RECORDED' } })).toBe(2);
    const visible = await BillingService.getTenantBills(tenant);
    expect(visible.some(bill => bill.id === billId)).toBe(true);
    expect(await BillingService.getTenantBills(owner)).toEqual([]);
  });

  test('one GCash reference cannot credit two bills concurrently or be reused after voiding', async () => {
    const next = await BillingService.generateMonthlyBill({ tenancyId, createdById: owner,
      billingPeriodStart: philippineDate('2026-11-01'), billingPeriodEnd: philippineDate('2026-11-30', true), dueDate: philippineDate('2026-12-01'),
    }, owner);
    const referenceNumber = marker.toUpperCase() + '-CONCURRENT';
    const input = { amount: 50, paymentDate: philippineDate('2026-10-15'), paymentMethod: 'GCASH' as const, recordedById: owner, referenceNumber };
    const outcomes = await Promise.allSettled([
      PaymentService.recordPayment({ ...input, billId, idempotencyKey: randomUUID() }, owner),
      PaymentService.recordPayment({ ...input, billId: next.id, idempotencyKey: randomUUID() }, owner),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const recorded = await prisma.payment.findFirstOrThrow({ where: { recordedById: owner, referenceNumber } });
    await PaymentService.voidPayment(recorded.id, 'Test reconciliation', owner);
    await expect(PaymentService.recordPayment({ ...input, billId: next.id, idempotencyKey: randomUUID() }, owner)).rejects.toThrow('already been recorded');
  });
});
