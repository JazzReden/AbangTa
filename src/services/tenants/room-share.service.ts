import { withTransactionRetry } from "@/lib/db/transaction-retry";
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import type { InvitationInput } from '@/lib/utils/invitation-input';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { reserveSpace } from '@/services/properties/occupancy';
import { checkRateLimit } from '@/lib/security/rate-limit';

type RoomInput = Extract<InvitationInput, { type: 'room' }>;
function signature(roomId: string, landlordId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Room sharing requires a configured authentication secret');
  return createHmac('sha256', secret).update('room-share:v1:' + roomId + ':' + landlordId).digest('hex');
}
function verify(input: RoomInput, landlordId: string) {
  const expected = signature(input.value, landlordId);
  if (!/^[a-f0-9]{64}$/.test(input.signature) || !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(input.signature, 'hex'))) {
    throw new Error('Invalid room invitation');
  }
}
async function availableRoom(input: RoomInput) {
  const room = await prisma.room.findUnique({ where: { id: input.value }, include: { property: true } });
  if (!room) throw new Error('Invalid room invitation');
  verify(input, room.property.landlordId);
  if (room.archivedAt || room.property.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
  return room;
}

export class RoomShareService {
  static async links(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    const rooms = await prisma.room.findMany({ where: { propertyId, archivedAt: null }, include: { beds: { where: { archivedAt: null }, orderBy: { label: 'asc' } } }, orderBy: { roomNumber: 'asc' } });
    return rooms.map(room => {
      const url = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Invitation URL must use HTTPS');
      url.pathname = '/join';
      url.search = new URLSearchParams({ room: room.id, token: signature(room.id, landlordId) }).toString();
      url.hash = '';
      return { ...room, invitationUrl: url.toString() };
    });
  }
  static async preview(input: RoomInput, userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'TENANT') throw new Error('FORBIDDEN');
    const room = await availableRoom(input);
    const occupied = await prisma.tenancy.count({ where: { roomId: room.id, status: { in: ['ACTIVE', 'PENDING'] } } });
    if (occupied >= (room.rentalMode === 'WHOLE_ROOM' ? 1 : room.capacity)) throw new Error('Room is full. Ask your landlord for another room.');
    const beds = room.rentalMode === 'PER_BED' ? await prisma.bed.findMany({ where: { roomId: room.id, archivedAt: null, status: 'VACANT', tenancies: { none: { status: { in: ['ACTIVE', 'PENDING'] } } } } }) : [];
    if (room.rentalMode === 'PER_BED' && !beds.length) throw new Error('No beds are available. Contact the landlord.');
    return { propertyName: room.property.name, address: room.property.address, roomNumber: room.roomNumber,
      rentalMode: room.rentalMode,
      maximumRent: beds.length ? beds.reduce((max, bed) => bed.monthlyRent.greaterThan(max) ? bed.monthlyRent : max, beds[0].monthlyRent).toFixed(2) : room.monthlyRent.toFixed(2),
      monthlyRent: beds.length ? beds.reduce((min, bed) => bed.monthlyRent.lessThan(min) ? bed.monthlyRent : min, beds[0].monthlyRent).toFixed(2) : room.monthlyRent.toFixed(2), startDate: '', expiresAt: '', needsApproval: true };
  }
  static async request(input: RoomInput, userId: string) {
    const reference = await availableRoom(input);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const room = await tx.room.findUniqueOrThrow({ where: { id: input.value }, include: { property: true } });
      verify(input, room.property.landlordId);
      if (room.archivedAt || room.property.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user?.role !== 'TENANT') throw new Error('FORBIDDEN');
      if (await tx.tenancy.count({ where: { tenantId: userId, status: { in: ['ACTIVE', 'PENDING'] } } })) throw new Error('You already have an active or pending room assignment');
      if (await tx.tenancy.count({ where: { roomId: room.id, status: { in: ['ACTIVE', 'PENDING'] } } }) >= (room.rentalMode === 'WHOLE_ROOM' ? 1 : room.capacity)) throw new Error('Room is full');
      if (room.rentalMode === 'PER_BED' && !await tx.bed.count({ where: { roomId: room.id, archivedAt: null, status: 'VACANT', tenancies: { none: { status: { in: ['ACTIVE', 'PENDING'] } } } } })) throw new Error('No beds are available');
      const previous = await tx.roomAccessRequest.findUnique({ where: { userId_roomId: { userId, roomId: room.id } } });
      if (previous?.status === 'REJECTED') throw new Error('Your request was declined. Contact the landlord.');
      if (previous?.status === 'APPROVED') throw new Error('This room request has already been approved. Contact the landlord.');
      if (!previous) {
        await tx.roomAccessRequest.create({ data: { userId, roomId: room.id } });
        await tx.notification.create({ data: { userId: room.property.landlordId, type: 'TENANT_INVITATION', title: 'Room join request',
          message: user.name + ' requested Room ' + room.roomNumber, relatedEntityType: 'Property', relatedEntityId: room.propertyId } });
      }
      return { joined: false };
    }, { isolationLevel: 'ReadCommitted' }));
  }
  static async review(requestId: string, landlordId: string, approve: boolean, bedId?: string) {
    if (!(await checkRateLimit('room-review:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many reviews. Please try again shortly.');
    const reference = await prisma.roomAccessRequest.findUnique({ where: { id: requestId }, include: { room: true } });
    if (!reference) throw new Error('Request not found');
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.room.propertyId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reference.userId} FOR UPDATE`;
      const request = await tx.roomAccessRequest.findUniqueOrThrow({ where: { id: requestId }, include: { user: true, room: { include: { property: true } } } });
      const { room } = request;
      if (room.property.landlordId !== landlordId) throw new Error('FORBIDDEN');
      if (request.status !== 'PENDING') throw new Error('Request is no longer pending');
      if (approve) {
        if (request.user.role !== 'TENANT') throw new Error('FORBIDDEN');
        if (room.archivedAt || room.property.archivedAt || room.status === 'MAINTENANCE') throw new Error('Room is unavailable');
        if (await tx.tenancy.count({ where: { tenantId: request.userId, status: { in: ['ACTIVE', 'PENDING'] } } })) throw new Error('Tenant already has a room assignment');
        const space = await reserveSpace(tx, room, bedId);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        await tx.tenancy.create({ data: { tenantId: request.userId, roomId: room.id, propertyId: room.propertyId,
          ...space, startDate: philippineDate(today), status: 'ACTIVE' } });
        if (space.bedId) await tx.bed.update({ where: { id: space.bedId }, data: { status: 'OCCUPIED' } });
        await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
        await tx.tenantProfile.upsert({ where: { userId: request.userId }, create: { userId: request.userId }, update: {} });
      }
      await tx.roomAccessRequest.update({ where: { id: requestId }, data: { status: approve ? 'APPROVED' : 'REJECTED' } });
      await tx.notification.create({ data: { userId: request.userId, type: 'TENANT_INVITATION', title: approve ? 'Room joined' : 'Join request declined',
        message: room.property.name + ' / Room ' + room.roomNumber } });
      return { joined: approve };
    }, { isolationLevel: 'ReadCommitted' }));
  }
  static async propertyRequests(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.roomAccessRequest.findMany({ where: { status: 'PENDING', room: { propertyId } },
      include: { user: { select: { name: true, email: true, phone: true } }, room: true }, orderBy: { createdAt: 'asc' } });
  }
  static async tenantRequests(userId: string) {
    return prisma.roomAccessRequest.findMany({ where: { userId }, include: { room: { include: { property: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 10 });
  }
}
