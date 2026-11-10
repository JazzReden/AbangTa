import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { TenantService } from '@/services/tenants/tenant.service';
import { PropertyService } from '@/services/properties/property.service';
import { BillingService } from '@/services/billing/billing.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import type { AdditionalCharge } from '@/lib/utils/additional-charges';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('tenant-specific parking bill integrity', () => {
  const marker = 'parking-' + randomUUID();
  const users: string[] = [], leases: string[] = [], historicalBills: string[] = [];
  let propertyId: string, otherPropertyId: string;
  const wifi: AdditionalCharge = { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 50 };
  const parking: AdditionalCharge = { itemType: 'PARKING', description: 'Parking', treatment: 'ADDITIONAL', amount: 100 };
  async function generate(index: number, month: number, additionalCharges?: AdditionalCharge[]) {
    const period = '2028-' + String(month).padStart(2, '0');
    return BillingService.generateMonthlyBill({ tenancyId: leases[index], createdById: users[0], billingPeriodStart: philippineDate(period + '-01'), billingPeriodEnd: philippineDate(period + '-28', true), dueDate: philippineDate(period + '-28', true), additionalCharges }, users[0]);
  }
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    for (let index = 0; index < 5; index++) users.push((await prisma.user.create({ data: { name: marker, email: marker + index + '@example.test', role: index < 2 ? 'LANDLORD' : 'TENANT', passwordHash: 'test-only' } })).id);
    const property = await prisma.property.create({ data: { landlordId: users[0], name: marker, address: 'Test only', utilityConfigs: { create: [{ utilityType: 'WATER', billingMethod: 'INCLUDED' }, { utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' }] } } });
    propertyId = property.id;
    otherPropertyId = (await prisma.property.create({ data: { landlordId: users[0], name: marker + '-other', address: 'Test only' } })).id;
    for (let index = 0; index < 3; index++) {
      const room = await prisma.room.create({ data: { propertyId, roomNumber: String(101 + index), monthlyRent: 1000 } });
      leases.push((await prisma.tenancy.create({ data: { propertyId, roomId: room.id, tenantId: users[index + 2], monthlyRent: 1000, startDate: philippineDate('2026-01-01'), status: 'ACTIVE' } })).id);
    }
    await PropertyService.setBillingCharges(propertyId, users[0], [wifi, parking]);
  });
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.bill.deleteMany({ where: { propertyId } });
    await prisma.tenancy.deleteMany({ where: { propertyId } });
    await prisma.room.deleteMany({ where: { propertyId } });
    await prisma.utilityConfig.deleteMany({ where: { propertyId } });
    await prisma.property.deleteMany({ where: { id: { in: [propertyId, otherPropertyId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test('new leases default to no parking; only an opted-in user pays the property fee', async () => {
    expect((await prisma.tenancy.findUniqueOrThrow({ where: { id: leases[0] } })).parkingMode).toBe('NOT_APPLICABLE');
    await TenantService.setParkingMode(propertyId, leases[1], users[0], 'FREE');
    await TenantService.setParkingMode(propertyId, leases[2], users[0], 'USE_PROPERTY_RATE');
    for (let index = 0; index < 3; index++) {
      const bill = await generate(index, 1);
      historicalBills.push(bill.id);
      expect(bill.totalAmount.toFixed(2)).toBe(index === 2 ? '1150.00' : '1050.00');
      const item = bill.items.find(row => row.itemType === 'PARKING');
      if (index === 0) expect(item).toBeUndefined();
      if (index === 1) expect(item?.chargeTreatment).toBe('FREE');
      if (index === 2) expect(item?.amount.toFixed(2)).toBe('100.00');
    }
  });

  test('free and not-applicable tenants cannot be charged by forged bill inputs', async () => {
    for (const index of [0, 1]) await expect(generate(index, 2, [wifi, parking])).rejects.toThrow('not assigned paid parking');
    expect(await prisma.bill.count({ where: { propertyId } })).toBe(3);
  });

  test('parking users inherit included/free property rates without changing rent or Wi-Fi', async () => {
    for (const [month, treatment] of [[2, 'INCLUDED'], [3, 'FREE']] as const) {
      await PropertyService.setBillingCharges(propertyId, users[0], [wifi, { ...parking, treatment, amount: 0 }]);
      const bill = await generate(2, month);
      expect(bill.totalAmount.toFixed(2)).toBe('1050.00');
      expect(bill.items.find(item => item.itemType === 'PARKING')?.chargeTreatment).toBe(treatment);
      expect(bill.items.find(item => item.itemType === 'WIFI')?.amount.toFixed(2)).toBe('50.00');
    }
  });

  test('removing paid parking changes future bills but never the historical bill', async () => {
    await PropertyService.setBillingCharges(propertyId, users[0], [wifi, parking]);
    await TenantService.setParkingMode(propertyId, leases[2], users[0], 'FREE');
    await expect(generate(2, 4, [wifi, parking])).rejects.toThrow('not assigned paid parking');
    const next = await generate(2, 4);
    expect(next.totalAmount.toFixed(2)).toBe('1050.00');
    expect((await prisma.bill.findUniqueOrThrow({ where: { id: historicalBills[2] } })).totalAmount.toFixed(2)).toBe('1150.00');
  });

  test('a different landlord, tenant, or mismatched property cannot change parking', async () => {
    await expect(TenantService.setParkingMode(propertyId, leases[0], users[1], 'FREE')).rejects.toThrow('FORBIDDEN');
    await expect(TenantService.setParkingMode(propertyId, leases[0], users[2], 'FREE')).rejects.toThrow('FORBIDDEN');
    await expect(TenantService.setParkingMode(otherPropertyId, leases[0], users[0], 'FREE')).rejects.toThrow('FORBIDDEN');
    await expect(TenantService.setParkingMode(propertyId, leases[0], users[0], 'INVALID' as never)).rejects.toThrow();
  });

  test('parking updates and billing share the property lock and preserve consistent totals', async () => {
    const [, bill] = await Promise.all([
      TenantService.setParkingMode(propertyId, leases[2], users[0], 'USE_PROPERTY_RATE'), generate(2, 5),
    ]);
    const item = bill.items.find(row => row.itemType === 'PARKING')!;
    expect(bill.totalAmount.toFixed(2)).toBe(item.chargeTreatment === 'FREE' ? '1050.00' : '1150.00');
    await prisma.tenancy.update({ where: { id: leases[0] }, data: { status: 'ENDED' } });
    await expect(TenantService.setParkingMode(propertyId, leases[0], users[0], 'FREE')).rejects.toThrow('active tenancy');
  });
});
