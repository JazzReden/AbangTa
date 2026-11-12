import { withTransactionRetry } from "@/lib/db/transaction-retry";
import { randomBytes } from 'node:crypto';
import Decimal from 'decimal.js';
import { tenantNextStep } from '@/lib/billing/tenant-next-step';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { invitationToken, tokenDigest } from '@/lib/security/tokens';
import { inviteTenantSchema, type InviteTenantInput } from '@/lib/validations';
import { createInvitationCode } from '@/lib/utils/invitations';
import { tenantParkingSchema, type TenantParkingMode } from '@/lib/utils/tenant-parking';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { reserveSpace, assertReservedBed } from '@/services/properties/occupancy';

export class TenantService {
  static async setParkingMode(propertyId: string, tenancyId: string, landlordId: string, mode: TenantParkingMode) {
    const parkingMode = tenantParkingSchema.parse(mode);
    await assertLandlordOwnsProperty(landlordId, propertyId);
    if (!(await checkRateLimit('tenant-parking:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many updates. Please try again shortly.');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
      const tenancy = await tx.tenancy.findUnique({ where: { id: tenancyId }, include: { property: true, room: true } });
      if (!tenancy || tenancy.propertyId !== propertyId || tenancy.property.landlordId !== landlordId || tenancy.property.archivedAt || tenancy.room.archivedAt) throw new Error('FORBIDDEN');
      if (tenancy.status !== 'ACTIVE') throw new Error('Parking can only be updated for an active tenancy');
      if (parkingMode === 'USE_PROPERTY_RATE' && !await tx.propertyBillingCharge.findUnique({ where: { propertyId_itemType: { propertyId, itemType: 'PARKING' } } })) {
        throw new Error('Configure the property parking default before assigning parking.');
      }
      return tx.tenancy.update({ where: { id: tenancyId }, data: { parkingMode } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async inviteTenant(propertyId: string, landlordId: string, raw: InviteTenantInput) {
    const input = inviteTenantSchema.parse(raw);
    await assertLandlordOwnsProperty(landlordId, propertyId);
    const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Invitation URL must use HTTPS');
    const secret = invitationToken();
    const shortCode = createInvitationCode();
    await withTransactionRetry(() => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
      const property = await tx.property.findUnique({ where: { id: propertyId } });
      if (!property || property.archivedAt || property.landlordId !== landlordId) throw new Error('Property is unavailable');
      const room = await tx.room.findUnique({ where: { id: input.roomId } });
      if (!room || room.propertyId !== propertyId || room.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
      const space = await reserveSpace(tx, room, input.bedId);
      const email = input.email.trim().toLowerCase();
      let tenant = await tx.user.findUnique({ where: { email } });
      if (tenant) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${tenant.id} FOR UPDATE`;
        if (tenant.role !== 'TENANT') throw new Error('This email belongs to a landlord');
        const conflict = await tx.tenancy.count({ where: { tenantId: tenant.id, status: { in: ['ACTIVE', 'PENDING'] } } });
        if (conflict) throw new Error('Tenant already has an active or pending tenancy');
      } else {
        tenant = await tx.user.create({ data: {
          email, name: input.name, role: 'TENANT', phone: input.phone,
          passwordHash: randomBytes(48).toString('hex'), tenantProfile: { create: {} },
        } });
      }
      const tenancy = await tx.tenancy.create({ data: {
        tenantId: tenant.id, roomId: room.id, propertyId, startDate: new Date(input.startDate),
        bedId: space.bedId, activeBedKey: space.activeBedKey,
        monthlyRent: room.rentalMode === 'PER_BED' ? space.monthlyRent : input.monthlyRent, securityDeposit: input.securityDeposit, status: 'PENDING', notes: input.notes,
      } });
      await tx.inviteToken.create({ data: {
        token: secret.digest, codeHash: shortCode.digest, userId: tenant.id, tenancyId: tenancy.id, expiresAt: new Date(Date.now() + 48 * 3600000),
      } });
      if (space.bedId) await tx.bed.update({ where: { id: space.bedId }, data: { status: 'OCCUPIED' } });
    }, { isolationLevel: 'ReadCommitted' }));
    url.pathname = '/join';
    url.search = new URLSearchParams({ token: secret.token }).toString();
    return { inviteUrl: url.toString(), invitationCode: shortCode.code };
  }

  static async acceptInvitation(token: string, tenantId: string) {
    const digest = tokenDigest(token);
    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const invite = await tx.inviteToken.findUnique({ where: { token: digest }, include: { tenancy: true } });
      if (!invite) throw new Error('Invalid or expired invitation');
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${invite.tenancy.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${tenantId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: tenantId } });
      if (!user || user.role !== 'TENANT' || invite.userId !== tenantId) {
        throw new Error('This invitation is assigned to another account. Submit a join request for landlord approval.');
      }
      const current = await tx.inviteToken.findUnique({ where: { token: digest }, include: { tenancy: { include: { room: true, property: true } } } });
      if (!current || current.usedAt || current.expiresAt <= new Date() || current.tenancy.status !== 'PENDING') throw new Error('Invitation is expired or already used');
      const { room, property } = current.tenancy;
      if (room.archivedAt || property.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
      const conflict = await tx.tenancy.count({ where: { tenantId, status: 'ACTIVE' } });
      if (conflict) throw new Error('This room assignment is no longer available');
      const space = await assertReservedBed(tx, room, current.tenancy);
      await tx.tenancy.update({ where: { id: current.tenancyId }, data: { status: 'ACTIVE', activeBedKey: space.activeBedKey } });
      if (space.bedId) await tx.bed.update({ where: { id: space.bedId }, data: { status: 'OCCUPIED' } });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
      await tx.inviteToken.update({ where: { id: current.id }, data: { usedAt: new Date() } });
      await tx.tenantProfile.upsert({ where: { userId: tenantId }, create: { userId: tenantId }, update: {} });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async endTenancy(tenancyId: string, landlordId: string) {
    if (!(await checkRateLimit('tenancy-end:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many updates. Please try again shortly.');
    return withTransactionRetry(() => prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findUnique({ where: { id: tenancyId } });
      if (!tenancy) throw new Error('Tenancy not found');
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${tenancy.propertyId} FOR UPDATE`;
      const property = await tx.property.findUnique({ where: { id: tenancy.propertyId } });
      if (property?.landlordId !== landlordId) throw new Error('FORBIDDEN');
      const current = await tx.tenancy.findUniqueOrThrow({ where: { id: tenancyId } });
      if (current.status === 'ENDED') return;
      await tx.tenancy.update({ where: { id: tenancyId }, data: { status: 'ENDED', endDate: new Date(), activeBedKey: null, cancelledAt: current.status === 'PENDING' ? new Date() : null } });
      if (current.bedId) await tx.bed.update({ where: { id: current.bedId }, data: { status: 'VACANT' } });
      await tx.inviteToken.updateMany({ where: { tenancyId }, data: { usedAt: new Date() } });
      const remaining = await tx.tenancy.count({ where: { roomId: tenancy.roomId, status: { in: ['ACTIVE', 'PENDING'] } } });
      await tx.room.update({ where: { id: tenancy.roomId }, data: { status: remaining ? 'OCCUPIED' : 'VACANT' } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  /** Get all tenants for a property (active and former). */
  static async getPropertyTenants(
    propertyId: string,
    landlordId: string,
    status?: 'ACTIVE' | 'ENDED' | 'PENDING'
  ) {
    await assertLandlordOwnsProperty(landlordId, propertyId);

    return prisma.tenancy.findMany({
      where: {
        propertyId,
        ...(status ? { status } : {}),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            tenantProfile: true,
          },
        },
        room: { select: { id: true, roomNumber: true } },
        bed: true,
      },
      orderBy: { startDate: 'desc' },
    });
  }

  /** Get the active tenancy for a tenant. */
  static async getActiveTenancy(tenantId: string) {
    return prisma.tenancy.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        room: true,
        bed: true,
        property: {
          include: {
            utilityConfigs: true,
            landlord: { select: { name: true, email: true, phone: true } },
          },
        },
      },
    });
  }

  /** Get tenant dashboard data. */
  static async getTenantDashboard(tenantId: string) {
    const tenancy = await this.getActiveTenancy(tenantId);
    if (!tenancy) return null;

    const bills = await prisma.bill.findMany({ where: { tenancy: { tenantId }, cancelledAt: null, status: { not: 'CANCELLED' } }, select: { id: true, totalAmount: true, dueDate: true, paymentProofs: { select: { status: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 }, payments: { where: { voidedAt: null }, select: { amount: true } } } });
    const unpaid = bills.map(bill => ({ ...bill, paid: bill.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)) }))
      .map(bill => ({ ...bill, remaining: Decimal.max(0, new Decimal(bill.totalAmount).minus(bill.paid)) })).filter(bill => bill.remaining.greaterThan(0));
    const outstandingBalance = unpaid.reduce((sum, bill) => sum.plus(bill.remaining), new Decimal(0)).toNumber();
    const earliestUnpaidDueDate = unpaid.reduce<Date | null>((date, bill) => !date || bill.dueDate < date ? bill.dueDate : date, null);
    const outstandingStatus = !unpaid.length ? 'PAID' as const : earliestUnpaidDueDate! < new Date() ? 'OVERDUE' as const : unpaid.some(bill => bill.paid.greaterThan(0)) ? 'PARTIALLY_PAID' as const : 'PENDING' as const;

    const [currentBill, recentPayments, maintenanceRequests, announcements] =
      await Promise.all([
        // Latest bill
        prisma.bill.findFirst({
          where: { tenancyId: tenancy.id, cancelledAt: null },
          include: { items: true, payments: { where: { voidedAt: null } } },
          orderBy: { billingPeriodStart: 'desc' },
        }),
        // Recent payments
        prisma.payment.findMany({
          where: { tenancyId: tenancy.id, voidedAt: null },
          orderBy: { paymentDate: 'desc' },
          take: 5,
        }),
        // Maintenance requests
        prisma.maintenanceRequest.findMany({
          where: { tenancyId: tenancy.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        // Property announcements
        prisma.announcement.findMany({
          where: {
            propertyId: tenancy.propertyId,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

    return {
      nextStep: tenantNextStep(unpaid),
      outstandingBalance,
      earliestUnpaidDueDate,
      outstandingStatus,
      tenancy,
      property: tenancy.property,
      room: tenancy.room,
      currentBill,
      recentPayments,
      maintenanceRequests,
      announcements,
    };
  }
}
