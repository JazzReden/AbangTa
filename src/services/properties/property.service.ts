import Decimal from 'decimal.js';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import type { CreatePropertyInput } from '@/lib/validations';
import { propertyChargesSchema, type AdditionalCharge } from '@/lib/utils/additional-charges';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getCurrentBillingPeriod } from '@/lib/utils/dates';

export class PropertyService {
  /** Create a new property for a landlord. */
  static async create(landlordId: string, input: CreatePropertyInput) {
    return prisma.property.create({
      data: {
        landlordId,
        name: input.name,
        address: input.address,
        description: input.description ?? null,
        contactPhone: input.contactPhone ?? null,
        contactEmail: input.contactEmail || null,
      },
    });
  }

  /** Get all active (non-archived) properties for a landlord. */
  static async getLandlordProperties(landlordId: string) {
    return prisma.property.findMany({
      where: { landlordId, archivedAt: null },
      include: {
        _count: { select: { rooms: true } },
        rooms: { where: { archivedAt: null }, select: { status: true, monthlyRent: true } },
        utilityConfigs: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get a single property with full details — validates landlord ownership. */
  static async getPropertyDetail(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);

    return prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        rooms: {
          where: { archivedAt: null },
          include: {
            beds: { where: { archivedAt: null }, include: { tenancies: { where: { status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true, startDate: true, endDate: true, status: true, tenant: { select: { name: true } } } } }, orderBy: { label: 'asc' } },
            tenancies: {
              where: { status: 'ACTIVE' },
              include: { bed: true, tenant: { select: { id: true, name: true, email: true, phone: true } } },
            },
          },
          orderBy: { roomNumber: 'asc' },
        },
        utilityConfigs: true,
        billingCharges: { orderBy: { itemType: 'asc' } },
        _count: { select: { maintenanceRequests: true } },
      },
    });
  }

  static async setBillingCharges(propertyId: string, landlordId: string, input: AdditionalCharge[]) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    const parsed = propertyChargesSchema.safeParse(input);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (!(await checkRateLimit('property-charges:' + landlordId, { limit: 30, windowMs: 60000 })).allowed) throw new Error('Too many updates. Please try again shortly.');
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property || property.landlordId !== landlordId || property.archivedAt) throw new Error('FORBIDDEN');
      await tx.propertyBillingCharge.deleteMany({ where: { propertyId } });
      if (parsed.data.length) await tx.propertyBillingCharge.createMany({ data: parsed.data.map(charge => ({
        propertyId, itemType: charge.itemType as 'WIFI' | 'PARKING', treatment: charge.treatment,
        amount: new Decimal(charge.amount),
      })) });
    }, { isolationLevel: 'ReadCommitted' });
  }

  /** Update a property — validates landlord ownership. */
  static async update(
    propertyId: string,
    landlordId: string,
    input: Partial<CreatePropertyInput>
  ) {
    await assertLandlordOwnsProperty(landlordId, propertyId);

    return prisma.property.update({
      where: { id: propertyId },
      data: {
        name: input.name,
        address: input.address,
        description: input.description,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail || null,
      },
    });
  }

  /** Archive a property (soft-delete). */
  static async archive(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);

    const activeCount = await prisma.tenancy.count({
      where: { propertyId, status: 'ACTIVE' },
    });

    if (activeCount > 0) {
      throw new Error(
        `Cannot archive a property with ${activeCount} active tenants. Please end all tenancies first.`
      );
    }

    return prisma.property.update({
      where: { id: propertyId },
      data: { archivedAt: new Date() },
    });
  }

  /** Upsert a utility config for a property. */
  static async setUtilityConfig(
    propertyId: string,
    landlordId: string,
    data: {
      utilityType: 'WATER' | 'ELECTRICITY';
      billingMethod: 'INCLUDED' | 'FIXED_RATE' | 'METERED';
      fixedAmount?: number;
      ratePerUnit?: number;
      unit?: string;
      splitMethod?: 'EQUAL_SPLIT' | 'PER_ROOM';
    }
  ) {
    await assertLandlordOwnsProperty(landlordId, propertyId);

    return prisma.utilityConfig.upsert({
      where: {
        propertyId_utilityType: {
          propertyId,
          utilityType: data.utilityType,
        },
      },
      create: {
        propertyId,
        utilityType: data.utilityType,
        billingMethod: data.billingMethod,
        fixedAmount: data.fixedAmount ?? null,
        ratePerUnit: data.ratePerUnit ?? null,
        unit: data.unit ?? null,
        splitMethod: data.splitMethod ?? 'EQUAL_SPLIT',
      },
      update: {
        billingMethod: data.billingMethod,
        fixedAmount: data.fixedAmount ?? null,
        ratePerUnit: data.ratePerUnit ?? null,
        unit: data.unit ?? null,
        splitMethod: data.splitMethod ?? 'EQUAL_SPLIT',
      },
    });
  }

  /** Get dashboard statistics for a landlord. */
  static async getDashboardStats(landlordId: string) {
    const properties = await prisma.property.findMany({
      where: { landlordId, archivedAt: null },
      include: {
        rooms: {
          where: { archivedAt: null },
          select: { status: true, monthlyRent: true, rentalMode: true, beds: { where: { archivedAt: null }, select: { status: true, tenancies: { where: { status: { in: ['ACTIVE', 'PENDING'] } }, select: { id: true } } } } },
        },
      },
    });

    const totalProperties = properties.length;
    const allRooms = properties.flatMap((p) => p.rooms);
    const totalRooms = allRooms.length;
    const occupiedRooms = allRooms.filter((r) => r.status === 'OCCUPIED').length;
    const vacantRooms = allRooms.filter((r) => r.status === 'VACANT').length;
    const availableBeds = allRooms.filter(room => room.rentalMode === 'PER_BED' && room.status !== 'MAINTENANCE').flatMap(room => room.beds).filter(bed => bed.status !== 'MAINTENANCE' && !bed.tenancies.length).length;

    // Active tenants
    const activeTenants = await prisma.tenancy.count({
      where: {
        property: { landlordId },
        status: 'ACTIVE',
      },
    });

    // Expected monthly rent from active tenancies
    const activeTenancies = await prisma.tenancy.findMany({
      where: { property: { landlordId }, status: 'ACTIVE' },
      select: { monthlyRent: true },
    });
    const expectedMonthlyRent = activeTenancies
      .reduce((sum, t) => sum.plus(new Decimal(t.monthlyRent)), new Decimal(0))
      .toNumber();

    // Payments this calendar month
    const { start: monthStart, end: monthEnd } = getCurrentBillingPeriod();

    const monthPayments = await prisma.payment.findMany({
      where: {
        tenancy: { property: { landlordId } },
        paymentDate: { gte: monthStart, lte: monthEnd },
        paymentMethod: { not: 'ADVANCE' },
        voidedAt: null,
      },
      select: { amount: true },
    });
    const advanceMovements = await prisma.tenantFundEntry.findMany({ where: { tenancy: { property: { landlordId } },
      kind: { in: ['ADVANCE_RECEIVED', 'ADVANCE_REFUNDED'] }, voidedAt: null, paymentDate: { gte: monthStart, lte: monthEnd } }, select: { kind: true, amount: true } });
    const collectedThisMonth = monthPayments
      .reduce((sum, p) => sum.plus(new Decimal(p.amount)), new Decimal(0))
      .plus(advanceMovements.reduce((sum, entry) => entry.kind === 'ADVANCE_RECEIVED' ? sum.plus(entry.amount) : sum.minus(entry.amount), new Decimal(0)))
      .toNumber();

    // Outstanding balance from open bills
    const openBills = await prisma.bill.findMany({
      where: {
        property: { landlordId },
        status: { in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        cancelledAt: null,
      },
      select: { totalAmount: true, amountPaid: true },
    });
    const outstandingBalance = openBills
      .reduce(
        (sum, b) =>
          sum.plus(new Decimal(b.totalAmount)).minus(new Decimal(b.amountPaid)),
        new Decimal(0)
      )
      .toNumber();

    // Open maintenance requests
    const openMaintenanceRequests = await prisma.maintenanceRequest.count({
      where: {
        property: { landlordId },
        status: { in: ['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
      },
    });

    return {
      totalProperties,
      totalRooms,
      occupiedRooms,
      vacantRooms,
      availableBeds,
      activeTenants,
      expectedMonthlyRent,
      collectedThisMonth,
      outstandingBalance,
      openMaintenanceRequests,
    };
  }

  static async getRecentActivity(landlordId: string) {
    const [payments, requests, announcements] = await Promise.all([
      prisma.payment.findMany({
        where: { tenancy: { property: { landlordId } }, voidedAt: null },
        include: {
          tenancy: {
            include: {
              tenant: { select: { name: true } },
              room: { select: { roomNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.maintenanceRequest.findMany({
        where: { property: { landlordId } },
        include: { room: { select: { roomNumber: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.announcement.findMany({
        where: { property: { landlordId } },
        include: { property: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return { payments, requests, announcements };
  }
}
