import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { PropertyService } from '@/services/properties/property.service';
import { BillingService } from '@/services/billing/billing.service';
import { philippineDate } from '@/lib/utils/philippine-dates';
import type { AdditionalCharge } from '@/lib/utils/additional-charges';

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('saved property monthly charge defaults', () => {
  const marker = 'defaults-' + randomUUID();
  const users: string[] = [], properties: string[] = [], tenancies: string[] = [];
  let owner: string, otherOwner: string, firstBill: string;
  const wifi = (amount: number): AdditionalCharge => ({ itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount });
  const parking: AdditionalCharge = { itemType: 'PARKING', description: 'Parking', treatment: 'FREE', amount: 0 };
  async function bill(month: number, additionalCharges?: AdditionalCharge[], propertyIndex = 0) {
    const prefix = '2027-' + String(month).padStart(2, '0');
    return BillingService.generateMonthlyBill({
      tenancyId: tenancies[propertyIndex], billingPeriodStart: philippineDate(prefix + '-01'),
      billingPeriodEnd: philippineDate(prefix + '-28', true), dueDate: philippineDate(prefix + '-28', true),
      createdById: owner, additionalCharges,
    }, owner);
  }
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    for (const role of ['LANDLORD', 'LANDLORD', 'TENANT', 'TENANT'] as const) {
      const user = await prisma.user.create({ data: { name: marker, email: marker + users.length + '@example.test', role, passwordHash: 'test-only' } });
      users.push(user.id);
    }
    [owner, otherOwner] = users;
    for (let index = 0; index < 2; index++) {
      const property = await prisma.property.create({ data: { name: marker + index, address: 'Test only', landlordId: owner,
        rooms: { create: { roomNumber: '101', monthlyRent: 1000 } }, utilityConfigs: { create: [
          { utilityType: 'WATER', billingMethod: 'INCLUDED' }, { utilityType: 'ELECTRICITY', billingMethod: 'INCLUDED' },
        ] },
      }, include: { rooms: true } });
      properties.push(property.id);
      tenancies.push((await prisma.tenancy.create({ data: { tenantId: users[index + 2], propertyId: property.id, roomId: property.rooms[0].id, monthlyRent: 1000, status: 'ACTIVE', parkingMode: 'USE_PROPERTY_RATE', startDate: philippineDate('2026-01-01') } })).id);
    }
  });
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.bill.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.tenancy.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.room.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.utilityConfig.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.property.deleteMany({ where: { id: { in: properties } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  test('saved defaults persist, automatically populate new bills, and stay isolated by property', async () => {
    await PropertyService.setBillingCharges(properties[0], owner, [wifi(100.25), parking]);
    const saved = await PropertyService.getPropertyDetail(properties[0], owner);
    expect(saved?.billingCharges).toHaveLength(2);
    const generated = await bill(1);
    firstBill = generated.id;
    expect(generated.totalAmount.toFixed(2)).toBe('1100.25');
    expect(generated.items.find(item => item.itemType === 'PARKING')?.chargeTreatment).toBe('FREE');
    expect((await bill(1, undefined, 1)).totalAmount.toFixed(2)).toBe('1000.00');
  });

  test('only the owning landlord can update defaults and invalid data cannot replace them', async () => {
    await expect(PropertyService.setBillingCharges(properties[0], otherOwner, [])).rejects.toThrow('FORBIDDEN');
    await expect(PropertyService.setBillingCharges(properties[0], users[2], [])).rejects.toThrow('FORBIDDEN');
    await expect(PropertyService.setBillingCharges(properties[0], owner, [wifi(-1)])).rejects.toThrow();
    expect(await prisma.propertyBillingCharge.count({ where: { propertyId: properties[0] } })).toBe(2);
  });

  test('individual bill overrides and explicit removal do not change the saved property defaults', async () => {
    const override = await bill(2, [{ ...wifi(0), treatment: 'INCLUDED' }, { ...parking, treatment: 'ADDITIONAL', amount: 50 }]);
    expect(override.totalAmount.toFixed(2)).toBe('1050.00');
    expect(override.items.find(item => item.itemType === 'WIFI')?.isIncluded).toBe(true);
    expect((await bill(3, [])).items.some(item => item.itemType === 'WIFI')).toBe(false);
    expect((await bill(4)).totalAmount.toFixed(2)).toBe('1100.25');
  });

  test('free/included defaults affect new bills only; old bill snapshots remain unchanged', async () => {
    await PropertyService.setBillingCharges(properties[0], owner, [{ ...wifi(0), treatment: 'FREE' }, { ...parking, treatment: 'INCLUDED' }]);
    const next = await bill(5);
    expect(next.totalAmount.toFixed(2)).toBe('1000.00');
    expect(next.items.find(item => item.itemType === 'WIFI')?.chargeTreatment).toBe('FREE');
    expect(next.items.find(item => item.itemType === 'PARKING')?.isIncluded).toBe(true);
    await PropertyService.setBillingCharges(properties[0], owner, []);
    expect((await bill(6)).items).toHaveLength(3);
    const prior = await prisma.bill.findUniqueOrThrow({ where: { id: firstBill }, include: { items: true } });
    expect(prior.totalAmount.toFixed(2)).toBe('1100.25');
    expect(prior.items.find(item => item.itemType === 'WIFI')?.amount.toFixed(2)).toBe('100.25');
  });

  test('simultaneous default updates and generation cannot capture half of a configuration', async () => {
    await PropertyService.setBillingCharges(properties[0], owner, [wifi(10), { ...parking, treatment: 'ADDITIONAL', amount: 20 }]);
    const [, generated] = await Promise.all([
      PropertyService.setBillingCharges(properties[0], owner, [wifi(11), { ...parking, treatment: 'ADDITIONAL', amount: 22 }]), bill(7),
    ]);
    expect(['1030.00', '1033.00']).toContain(generated.totalAmount.toFixed(2));
    expect(generated.items.filter(item => item.itemType === 'WIFI' || item.itemType === 'PARKING')).toHaveLength(2);
  });
});
