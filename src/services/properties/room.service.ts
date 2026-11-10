import { withTransactionRetry } from "@/lib/db/transaction-retry";
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { createRoomSchema, type CreateRoomInput } from '@/lib/validations';
import { checkRateLimit } from '@/lib/security/rate-limit';
import type { Prisma } from '@prisma/client';

const bedSchema = z.object({ label: z.string().trim().min(1).max(40), monthlyRent: createRoomSchema.shape.monthlyRent,
  status: z.enum(['VACANT', 'MAINTENANCE']) });

export class RoomService {
  private static async writeLimit(landlordId: string) {
    if (!(await checkRateLimit('room-write:' + landlordId, { limit: 60, windowMs: 60000 })).allowed) throw new Error('Too many updates. Please try again shortly.');
  }

  private static async lockedRoom(tx: Prisma.TransactionClient, roomId: string, landlordId: string) {
    const reference = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    await tx.$queryRaw`SELECT id FROM properties WHERE id = ${reference.propertyId} FOR UPDATE`;
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId }, include: { property: true } });
    if (room.property.landlordId !== landlordId || room.property.archivedAt || room.archivedAt) throw new Error('FORBIDDEN');
    return room;
  }

  static async create(propertyId: string, landlordId: string, raw: CreateRoomInput) {
    const input = createRoomSchema.parse(raw);
    await assertLandlordOwnsProperty(landlordId, propertyId);
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
      const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId } });
      if (property.landlordId !== landlordId || property.archivedAt) throw new Error('FORBIDDEN');
      const rentalMode = input.rentalMode ?? 'WHOLE_ROOM';
      if (rentalMode === 'LEGACY_SHARED') throw new Error('Choose whole-room or individual-bed rental for a new room');
      return tx.room.create({ data: { ...input, propertyId, rentalMode,
        beds: rentalMode === 'PER_BED' ? { create: Array.from({ length: input.capacity }, (_, i) => ({ label: 'Bed ' + (i + 1), monthlyRent: input.monthlyRent })) } : undefined } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async getPropertyRooms(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.room.findMany({ where: { propertyId, archivedAt: null }, include: {
      beds: { where: { archivedAt: null }, orderBy: { label: 'asc' } },
      tenancies: { where: { status: 'ACTIVE' }, include: { bed: true, tenant: { select: { id: true, name: true, email: true, phone: true } } } },
      _count: { select: { maintenanceRequests: true } },
    }, orderBy: { roomNumber: 'asc' } });
  }

  static async update(roomId: string, landlordId: string, raw: Partial<CreateRoomInput>) {
    const input = createRoomSchema.partial().parse(raw);
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const room = await this.lockedRoom(tx, roomId, landlordId);
      const occupied = await tx.tenancy.count({ where: { roomId, status: { in: ['ACTIVE', 'PENDING'] } } });
      const modelChange = input.rentalMode !== undefined && input.rentalMode !== room.rentalMode;
      if (modelChange && input.rentalMode === 'LEGACY_SHARED') throw new Error('Choose whole-room or individual-bed rental');
      if (modelChange && occupied) throw new Error('End active and pending tenancies before changing the rental mode');
      if (input.capacity !== undefined && input.capacity < occupied) throw new Error('Capacity is below current assignments');
      const mode = input.rentalMode ?? room.rentalMode;
      if (mode === 'PER_BED') {
        const beds = await tx.bed.count({ where: { roomId, archivedAt: null } });
        if (input.capacity !== undefined && input.capacity < beds) throw new Error('Archive unused beds before reducing capacity');
        if (modelChange && !beds) await tx.bed.createMany({ data: Array.from({ length: input.capacity ?? room.capacity }, (_, i) => ({ roomId, label: 'Bed ' + (i + 1), monthlyRent: input.monthlyRent ?? room.monthlyRent })) });
      }
      return tx.room.update({ where: { id: roomId }, data: input });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async saveBed(roomId: string, landlordId: string, bedId: string | undefined, raw: z.input<typeof bedSchema>) {
    const input = bedSchema.parse(raw);
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      const room = await this.lockedRoom(tx, roomId, landlordId);
      if (room.rentalMode !== 'PER_BED') throw new Error('Choose individual bed rental first');
      const bed = bedId ? await tx.bed.findUnique({ where: { id: bedId } }) : null;
      if (bedId && (!bed || bed.roomId !== roomId || bed.archivedAt)) throw new Error('FORBIDDEN');
      const reserved = bedId ? await tx.tenancy.count({ where: { bedId, status: { in: ['ACTIVE', 'PENDING'] } } }) : 0;
      if (reserved && input.status === 'MAINTENANCE') throw new Error('An assigned bed cannot be marked under maintenance');
      if (!bedId && await tx.bed.count({ where: { roomId, archivedAt: null } }) >= room.capacity) throw new Error('Increase room capacity before adding a bed');
      const data = { ...input, status: reserved ? 'OCCUPIED' as const : input.status };
      return bedId ? tx.bed.update({ where: { id: bedId }, data }) : tx.bed.create({ data: { ...data, roomId } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async archiveBed(roomId: string, bedId: string, landlordId: string) {
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await this.lockedRoom(tx, roomId, landlordId);
      const bed = await tx.bed.findUnique({ where: { id: bedId } });
      if (!bed || bed.roomId !== roomId) throw new Error('FORBIDDEN');
      if (await tx.tenancy.count({ where: { bedId, status: { in: ['ACTIVE', 'PENDING'] } } })) throw new Error('End the bed tenancy before archiving');
      return tx.bed.update({ where: { id: bedId }, data: { archivedAt: new Date() } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async updateStatus(roomId: string, landlordId: string, status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE') {
    z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']).parse(status);
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await this.lockedRoom(tx, roomId, landlordId);
      const count = await tx.tenancy.count({ where: { roomId, status: { in: ['ACTIVE', 'PENDING'] } } });
      if (count && status !== 'OCCUPIED') throw new Error('End active and pending tenancies before marking this room vacant or under maintenance');
      if (!count && status === 'OCCUPIED') throw new Error('Approve a tenant assignment to occupy this room');
      return tx.room.update({ where: { id: roomId }, data: { status } });
    }, { isolationLevel: 'ReadCommitted' }));
  }

  static async archive(roomId: string, landlordId: string) {
    await this.writeLimit(landlordId);
    return withTransactionRetry(() => prisma.$transaction(async tx => {
      await this.lockedRoom(tx, roomId, landlordId);
      if (await tx.tenancy.count({ where: { roomId, status: { in: ['ACTIVE', 'PENDING'] } } })) throw new Error('End active and pending tenancies before archiving');
      return tx.room.update({ where: { id: roomId }, data: { archivedAt: new Date(), status: 'VACANT' } });
    }, { isolationLevel: 'ReadCommitted' }));
  }
}
