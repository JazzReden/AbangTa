import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { assertLandlordOwnsProperty } from '@/lib/permissions';
import { createAnnouncementSchema, type CreateAnnouncementInput } from '@/lib/validations';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { checkRateLimit } from '@/lib/security/rate-limit';

async function limitWrites(userId: string) {
  if (!(await checkRateLimit('news-write:' + userId, { limit: 20, windowMs: 60000 })).allowed) {
    throw new Error('Too many updates. Please wait a minute.');
  }
}
function content(raw: CreateAnnouncementInput) {
  const input = createAnnouncementSchema.parse(raw);
  const expiresAt = input.expiresAt ? philippineDate(input.expiresAt, true) : null;
  if (expiresAt && expiresAt <= new Date()) throw new Error('Expiry must be today or a future date');
  return { title: input.title, message: input.message, expiresAt };
}
async function lockProperty(tx: Prisma.TransactionClient, propertyId: string, landlordId: string) {
  await tx.$queryRaw`SELECT id FROM properties WHERE id = ${propertyId} FOR UPDATE`;
  const property = await tx.property.findUnique({ where: { id: propertyId }, include: { landlord: { select: { role: true } } } });
  if (!property || property.landlordId !== landlordId || property.landlord.role !== 'LANDLORD') throw new Error('FORBIDDEN');
  if (property.archivedAt) throw new Error('Property is archived');
}

export class AnnouncementService {
  static async create(propertyId: string, raw: CreateAnnouncementInput, landlordId: string) {
    await limitWrites(landlordId);
    const data = content(raw);
    return prisma.$transaction(async tx => {
      await lockProperty(tx, propertyId, landlordId);
      const announcement = await tx.announcement.create({ data: { ...data, propertyId, createdById: landlordId } });
      const tenants = await tx.tenancy.findMany({ where: { propertyId, status: 'ACTIVE', room: { archivedAt: null }, tenant: { role: 'TENANT' } }, select: { tenantId: true }, distinct: ['tenantId'] });
      if (tenants.length) await tx.notification.createMany({ data: tenants.map(tenant => ({
        userId: tenant.tenantId, type: 'NEW_ANNOUNCEMENT' as const, title: 'Property news: ' + data.title,
        message: data.message.slice(0, 200), relatedEntityType: 'Announcement', relatedEntityId: announcement.id,
      })) });
      return announcement;
    }, { isolationLevel: 'ReadCommitted' });
  }
  static async update(id: string, raw: CreateAnnouncementInput, landlordId: string) {
    await limitWrites(landlordId);
    const data = content(raw);
    const reference = await prisma.announcement.findUnique({ where: { id }, select: { propertyId: true } });
    if (!reference) throw new Error('Update not found');
    return prisma.$transaction(async tx => {
      await lockProperty(tx, reference.propertyId, landlordId);
      return tx.announcement.update({ where: { id }, data });
    }, { isolationLevel: 'ReadCommitted' });
  }
  static async archive(id: string, landlordId: string) {
    await limitWrites(landlordId);
    const reference = await prisma.announcement.findUnique({ where: { id }, select: { propertyId: true } });
    if (!reference) throw new Error('Update not found');
    return prisma.$transaction(async tx => {
      await lockProperty(tx, reference.propertyId, landlordId);
      return tx.announcement.update({ where: { id }, data: { expiresAt: new Date() } });
    }, { isolationLevel: 'ReadCommitted' });
  }
  static async getPropertyAnnouncements(propertyId: string, landlordId: string) {
    await assertLandlordOwnsProperty(landlordId, propertyId);
    return prisma.announcement.findMany({ where: { propertyId }, include: { createdBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  static async getTenantAnnouncements(tenantId: string) {
    return prisma.announcement.findMany({ where: {
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      property: { archivedAt: null, tenancies: { some: { tenantId, status: 'ACTIVE', tenant: { role: 'TENANT' }, room: { archivedAt: null } } } },
    }, include: { createdBy: { select: { name: true } }, property: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  // Legacy callers now archive instead of permanently deleting property history.
  static async delete(id: string, landlordId: string) {
    return this.archive(id, landlordId);
  }
}
