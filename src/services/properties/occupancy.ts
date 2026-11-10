import type { Prisma, Room } from '@prisma/client';

// All callers hold the property row lock, also used by billing and room edits.
export async function reserveSpace(tx: Prisma.TransactionClient, room: Room, bedId?: string | null, excludeTenancyId?: string) {
  const where = { roomId: room.id, status: { in: ['ACTIVE', 'PENDING'] as Array<'ACTIVE' | 'PENDING'> },
    ...(excludeTenancyId ? { id: { not: excludeTenancyId } } : {}) };
  const occupants = await tx.tenancy.count({ where });
  const limit = room.rentalMode === 'WHOLE_ROOM' ? 1 : room.capacity;
  if (occupants >= limit) throw new Error('Room is full');
  if (room.rentalMode !== 'PER_BED') {
    if (bedId) throw new Error('This room is not rented by bed');
    return { bedId: null, activeBedKey: null, monthlyRent: room.monthlyRent };
  }
  if (!bedId) throw new Error('Choose an available bed before approving');
  const bed = await tx.bed.findUnique({ where: { id: bedId } });
  if (!bed || bed.roomId !== room.id || bed.archivedAt || bed.status === 'MAINTENANCE') throw new Error('Bed is unavailable');
  if (await tx.tenancy.count({ where: { ...where, bedId } })) throw new Error('Bed is already assigned');
  return { bedId: bed.id, activeBedKey: bed.id, monthlyRent: bed.monthlyRent };
}

export async function assertReservedBed(tx: Prisma.TransactionClient, room: Room, tenancy: { id: string; bedId: string | null }) {
  return reserveSpace(tx, room, tenancy.bedId, tenancy.id);
}
