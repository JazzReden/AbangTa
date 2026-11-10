import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { AnnouncementService } from '@/services/notifications/announcement.service';
import { createAnnouncementSchema } from '@/lib/validations';
import { resetRateLimit } from '@/lib/security/rate-limit';

test('news input is trimmed, length bounded, and rejects invalid expiry dates', () => {
  expect(createAnnouncementSchema.parse({ title: '  Wi-Fi update  ', message: '  Please use the new network credentials.  ' }).title).toBe('Wi-Fi update');
  expect(createAnnouncementSchema.safeParse({ title: '   ', message: 'Please use the new network credentials.' }).success).toBe(false);
  expect(createAnnouncementSchema.safeParse({ title: 'Valid title', message: 'x'.repeat(5001) }).success).toBe(false);
  expect(createAnnouncementSchema.safeParse({ title: 'Valid title', message: 'Valid message text', expiresAt: '2026-02-30' }).success).toBe(false);
});

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Property news isolation, updates and rate limiting', () => {
  const marker = 'news-test-' + randomUUID();
  let owner: string, otherOwner: string, member: string, former: string, pending: string, otherTenant: string;
  let propertyId: string, otherProperty: string, postId: string;
  const input = { title: 'Water leak repaired', message: 'The water leak in Room 101 has been repaired.' };
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const account = async (suffix: string, role: 'LANDLORD' | 'TENANT') => (await prisma.user.create({ data: { name: marker, email: marker + suffix + '@example.test', role, passwordHash: 'fixture-only' } })).id;
    owner = await account('owner', 'LANDLORD'); otherOwner = await account('other-owner', 'LANDLORD');
    member = await account('member', 'TENANT'); former = await account('former', 'TENANT');
    pending = await account('pending', 'TENANT'); otherTenant = await account('other-tenant', 'TENANT');
    propertyId = (await prisma.property.create({ data: { landlordId: owner, name: marker, address: 'Fixture only' } })).id;
    otherProperty = (await prisma.property.create({ data: { landlordId: otherOwner, name: marker, address: 'Other fixture' } })).id;
    const room = await prisma.room.create({ data: { propertyId, roomNumber: '101', monthlyRent: 4000, capacity: 5 } });
    const otherRoom = await prisma.room.create({ data: { propertyId: otherProperty, roomNumber: '201', monthlyRent: 4000 } });
    await prisma.tenancy.createMany({ data: [
      { propertyId, roomId: room.id, tenantId: member, startDate: new Date(), monthlyRent: 4000, status: 'ACTIVE' },
      { propertyId, roomId: room.id, tenantId: member, startDate: new Date(), monthlyRent: 4000, status: 'ACTIVE' },
      { propertyId, roomId: room.id, tenantId: former, startDate: new Date(), monthlyRent: 4000, status: 'ENDED' },
      { propertyId, roomId: room.id, tenantId: pending, startDate: new Date(), monthlyRent: 4000, status: 'PENDING' },
      { propertyId: otherProperty, roomId: otherRoom.id, tenantId: otherTenant, startDate: new Date(), monthlyRent: 4000, status: 'ACTIVE' },
    ] });
  });
  test('publishes only to approved members of the property, with one notification per account', async () => {
    const post = await AnnouncementService.create(propertyId, input, owner); postId = post.id;
    expect((await AnnouncementService.getTenantAnnouncements(member)).map(item => item.id)).toEqual([postId]);
    for (const userId of [former, pending, otherTenant, otherOwner]) expect(await AnnouncementService.getTenantAnnouncements(userId)).toHaveLength(0);
    expect(await prisma.notification.count({ where: { relatedEntityId: postId } })).toBe(1);
    expect(await prisma.notification.count({ where: { relatedEntityId: postId, userId: member } })).toBe(1);
    await expect(AnnouncementService.getPropertyAnnouncements(propertyId, otherOwner)).rejects.toThrow('FORBIDDEN');
    await expect(AnnouncementService.create(propertyId, input, otherOwner)).rejects.toThrow('FORBIDDEN');
  });
  test('owner can edit and archive; unauthorized accounts cannot change posts', async () => {
    await expect(AnnouncementService.update(postId, input, otherOwner)).rejects.toThrow('FORBIDDEN');
    await expect(AnnouncementService.archive(postId, otherOwner)).rejects.toThrow('FORBIDDEN');
    await AnnouncementService.update(postId, { ...input, message: 'Room 101 is repaired. The water supply is restored.' }, owner);
    expect((await AnnouncementService.getTenantAnnouncements(member))[0].message).toContain('supply is restored');
    await AnnouncementService.archive(postId, owner);
    expect(await AnnouncementService.getTenantAnnouncements(member)).toHaveLength(0);
    expect(await AnnouncementService.getPropertyAnnouncements(propertyId, owner)).toHaveLength(1);
  });
  test('expiry and membership changes immediately remove tenant visibility', async () => {
    const post = await AnnouncementService.create(propertyId, input, owner);
    await prisma.announcement.update({ where: { id: post.id }, data: { expiresAt: new Date(0) } });
    expect(await AnnouncementService.getTenantAnnouncements(member)).toHaveLength(0);
    await AnnouncementService.update(post.id, input, owner);
    await prisma.tenancy.updateMany({ where: { tenantId: member, propertyId }, data: { status: 'ENDED' } });
    expect(await AnnouncementService.getTenantAnnouncements(member)).toHaveLength(0);
    await expect(AnnouncementService.create(propertyId, { ...input, expiresAt: '2000-01-01' }, owner)).rejects.toThrow('Expiry');
  });
  test('bounds repeated news writes per landlord', async () => {
    await resetRateLimit('news-write:' + owner, { limit: 20, windowMs: 60000 });
    for (let attempt = 0; attempt < 20; attempt++) await expect(AnnouncementService.create(propertyId, { title: '', message: '' }, owner)).rejects.toThrow();
    await expect(AnnouncementService.create(propertyId, input, owner)).rejects.toThrow('Too many updates');
    await resetRateLimit('news-write:' + owner, { limit: 20, windowMs: 60000 });
  });
  afterAll(async () => {
    const properties = [propertyId, otherProperty].filter(Boolean);
    const users = [owner, otherOwner, member, former, pending, otherTenant].filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.announcement.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.tenancy.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.room.deleteMany({ where: { propertyId: { in: properties } } });
    await prisma.property.deleteMany({ where: { id: { in: properties } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
});
