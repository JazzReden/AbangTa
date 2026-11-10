import { withTransactionRetry } from "@/lib/db/transaction-retry";
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { tokenDigest } from '@/lib/security/tokens';
import { codeDigest } from '@/lib/utils/invitations';
import { parseInvitationInput } from '@/lib/utils/invitation-input';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { RoomShareService } from './room-share.service';
import { assertReservedBed } from '@/services/properties/occupancy';

function whereInvitation(input: string) {
  const parsed = parseInvitationInput(input);
  if (parsed.type === 'room') throw new Error('Use the room sharing flow');
  return parsed.type === 'token' ? { token: tokenDigest(parsed.value) } : { codeHash: codeDigest(parsed.value) };
}
async function validInvitation(input: string, db: Prisma.TransactionClient = prisma) {
  const invite = await db.inviteToken.findUnique({
    where: whereInvitation(input),
    include: { tenancy: { include: { room: true, property: true } } },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date() || invite.tenancy.status !== 'PENDING') {
    throw new Error('Invitation is expired, invalid, or already used. Ask your landlord for a new invitation.');
  }
  if (invite.tenancy.room.archivedAt || invite.tenancy.property.archivedAt || invite.tenancy.room.status === 'MAINTENANCE') {
    throw new Error('This room is unavailable');
  }
  return invite;
}

export class RoomJoinService {
  static async preview(input: string, tenantId: string) {
    if (!(await checkRateLimit('join-preview:' + tenantId, { limit: 20, windowMs: 60000 })).allowed) throw new Error('Too many attempts. Please wait a minute.');
    const parsed = parseInvitationInput(input);
    if (parsed.type === 'room') return RoomShareService.preview(parsed, tenantId);
    const user = await prisma.user.findUnique({ where: { id: tenantId } });
    if (user?.role !== 'TENANT') throw new Error('FORBIDDEN');
    const invite = await validInvitation(input);
    return {
      propertyName: invite.tenancy.property.name,
      address: invite.tenancy.property.address,
      roomNumber: invite.tenancy.room.roomNumber,
      monthlyRent: invite.tenancy.monthlyRent.toFixed(2),
      startDate: invite.tenancy.startDate.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      needsApproval: invite.userId !== tenantId,
    };
  }

  static async confirm(input: string, tenantId: string) {
    const parsed = parseInvitationInput(input);
    if (parsed.type === 'room') return RoomShareService.request(parsed, tenantId);
    const invite = await validInvitation(input);
    if (invite.userId === tenantId) {
      return this.assign(invite.id, tenantId, tenantId);
    }
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${invite.tenancy.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${tenantId} FOR UPDATE`;
      const current = await validInvitation(input, tx);
      const user = await tx.user.findUnique({ where: { id: tenantId } });
      if (user?.role !== 'TENANT') throw new Error('FORBIDDEN');
      const active = await tx.tenancy.count({ where: { tenantId, status: { in: ['ACTIVE', 'PENDING'] } } });
      if (active) throw new Error('You already have an active or pending room assignment');
      const previous = await tx.roomJoinRequest.findUnique({ where: { userId_inviteId: { userId: tenantId, inviteId: current.id } } });
      if (previous?.status === 'REJECTED') throw new Error('Your request was declined. Contact the landlord.');
      if (!previous) {
        await tx.roomJoinRequest.create({ data: { userId: tenantId, inviteId: current.id } });
        await tx.notification.create({ data: {
          userId: current.tenancy.property.landlordId, type: 'TENANT_INVITATION', title: 'Room join request',
          message: user.name + ' requested Room ' + current.tenancy.room.roomNumber,
          relatedEntityType: 'Property', relatedEntityId: current.tenancy.propertyId,
        } });
      }
      return { joined: false };
    }, { isolationLevel: 'ReadCommitted' }));
  }

  private static async assign(inviteId: string, tenantId: string, actorId: string, requestId?: string) {
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const reference = await tx.inviteToken.findUnique({ where: { id: inviteId }, include: { tenancy: true } });
      if (!reference) throw new Error('Invitation not found');
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.tenancy.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${tenantId} FOR UPDATE`;
      const invite = await tx.inviteToken.findUnique({ where: { id: inviteId }, include: { tenancy: { include: { room: true, property: true } } } });
      if (!invite || invite.usedAt || invite.expiresAt <= new Date() || invite.tenancy.status !== 'PENDING') throw new Error('Invitation is no longer available');
      const { property, room } = invite.tenancy;
      if (requestId) {
        if (property.landlordId !== actorId) throw new Error('FORBIDDEN');
        const request = await tx.roomJoinRequest.findUnique({ where: { id: requestId } });
        if (!request || request.inviteId !== inviteId || request.userId !== tenantId || request.status !== 'PENDING') throw new Error('Request is no longer pending');
      } else if (actorId !== tenantId || invite.userId !== tenantId) throw new Error('FORBIDDEN');
      const user = await tx.user.findUnique({ where: { id: tenantId } });
      if (user?.role !== 'TENANT') throw new Error('FORBIDDEN');
      if (property.archivedAt || room.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
      const conflicts = await tx.tenancy.count({ where: { tenantId, id: { not: invite.tenancyId }, status: { in: ['ACTIVE', 'PENDING'] } } });
      if (conflicts) throw new Error('This room assignment is no longer available');
      const space = await assertReservedBed(tx, room, invite.tenancy);
      await tx.tenancy.update({ where: { id: invite.tenancyId }, data: { tenantId, status: 'ACTIVE', activeBedKey: space.activeBedKey } });
      if (space.bedId) await tx.bed.update({ where: { id: space.bedId }, data: { status: 'OCCUPIED' } });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
      await tx.inviteToken.update({ where: { id: invite.id }, data: { userId: tenantId, usedAt: new Date() } });
      if (requestId) await tx.roomJoinRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } });
      await tx.roomJoinRequest.updateMany({ where: { inviteId, status: 'PENDING' }, data: { status: 'REJECTED' } });
      await tx.notification.create({ data: { userId: tenantId, type: 'TENANT_INVITATION', title: 'Room joined', message: property.name + ' / Room ' + room.roomNumber } });
      return { joined: true };
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async review(requestId: string, landlordId: string, approve: boolean) {
    if (!(await checkRateLimit('room-review:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many reviews. Please try again shortly.');
    const request = await prisma.roomJoinRequest.findUnique({ where: { id: requestId }, include: { invite: { include: { tenancy: true } } } });
    if (!request) throw new Error('Request not found');
    await assertLandlordOwnsProperty(landlordId, request.invite.tenancy.propertyId);
    if (approve) return this.assign(request.inviteId, request.userId, landlordId, request.id);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const properties = await tx.$queryRaw<Array<{ landlordId: string }>>`SELECT landlordId FROM properties WHERE id = ${request.invite.tenancy.propertyId} FOR UPDATE`;
      if (properties[0]?.landlordId !== landlordId) throw new Error('FORBIDDEN');
      const result = await tx.roomJoinRequest.updateMany({ where: { id: requestId, status: 'PENDING' }, data: { status: 'REJECTED' } });
      if (!result.count) throw new Error('Request is no longer pending');
      return { joined: false };
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async propertyRequests(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.roomJoinRequest.findMany({ where: { invite: { tenancy: { propertyId, status: 'PENDING' }, usedAt: null, expiresAt: { gt: new Date() } }, status: 'PENDING' },
      include: { user: { select: { name: true, email: true, phone: true } }, invite: { include: { tenancy: { include: { room: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  static async tenantRequests(userId: string) {
    return prisma.roomJoinRequest.findMany({ where: { userId },
      include: { invite: { include: { tenancy: { include: { room: true, property: { select: { name: true } } } } } } },
      orderBy: { createdAt: 'desc' }, take: 10,
    });
  }
}
