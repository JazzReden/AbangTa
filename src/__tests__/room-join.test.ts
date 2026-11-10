import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { RoomJoinService } from '@/services/tenants/room-join.service';
import { TenantService } from '@/services/tenants/tenant.service';
import { parseInvitationInput } from '@/lib/utils/invitation-input';
import { codeDigest } from '@/lib/utils/invitations';
import { RoomShareService } from '@/services/tenants/room-share.service';
import { safeReturnTo } from '@/lib/auth/intent';
import QRCode from 'qrcode';

describe('Invitation input', () => {
  const token = 'a'.repeat(64);
  test('accepts links, raw tokens and grouped codes', () => {
    expect(parseInvitationInput('https://example.test/join?token=' + token)).toEqual({ type: 'token', value: token });
    expect(parseInvitationInput(token)).toEqual({ type: 'token', value: token });
    expect(parseInvitationInput('abcd-1234-ef56')).toEqual({ type: 'code', value: 'ABCD1234EF56' });
    expect(codeDigest('abcd-1234-ef56')).toBe(codeDigest('ABCD1234EF56'));
  });
  test.each(['javascript:alert(1)', 'https://example.test/other?token=' + token, 'bad-code', '/join?token=short', '/join?token=' + token + '&token=' + token])('rejects unsafe or malformed input %s', input => {
    expect(() => parseInvitationInput(input)).toThrow();
  });
  test('preserves signed room invitations across sign in without allowing external redirects', () => {
    const path = '/join?room=room101&token=' + token;
    expect(parseInvitationInput(path)).toEqual({ type: 'room', value: 'room101', signature: token });
    expect(safeReturnTo(path)).toBe('/join?token=' + token + '&room=room101');
    expect(safeReturnTo('https://attacker.test' + path)).toBe('/onboarding');
    expect(safeReturnTo(path + '&room=other')).toBe('/onboarding');
  });
});

const suite = process.env.ABANGTA_DB_TESTS === '1' ? describe : describe.skip;
suite('Room joining with isolated database fixtures', () => {
  const marker = 'join-test-' + randomUUID();
  let owner: string, outsider: string, target: string, requester: string, propertyId: string, roomId: string;
  let link: string, code: string;
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    owner = (await prisma.user.create({ data: { name: marker, email: marker + '-owner@example.test', role: 'LANDLORD', passwordHash: 'test-only' } })).id;
    outsider = (await prisma.user.create({ data: { name: marker, email: marker + '-other@example.test', role: 'LANDLORD', passwordHash: 'test-only' } })).id;
    target = (await prisma.user.create({ data: { name: marker, email: marker + '-target@example.test', role: 'TENANT', passwordHash: 'test-only' } })).id;
    requester = (await prisma.user.create({ data: { name: marker, role: 'TENANT', passwordHash: 'test-only' } })).id;
    propertyId = (await prisma.property.create({ data: { landlordId: owner, name: marker, address: 'Fixture address' } })).id;
    roomId = (await prisma.room.create({ data: { propertyId, roomNumber: '101', monthlyRent: 2500, capacity: 1 } })).id;
    const invitation = await TenantService.inviteTenant(propertyId, owner, { name: marker, email: marker + '-target@example.test', roomId, startDate: '2026-10-15', monthlyRent: 2500 });
    link = invitation.inviteUrl;
    code = invitation.invitationCode;
  });
  test('password tenant can preview and join by code; codes are hashed and single use', async () => {
    expect((await RoomJoinService.preview(code, target)).needsApproval).toBe(false);
    expect((await prisma.inviteToken.findUniqueOrThrow({ where: { codeHash: codeDigest(code) } })).codeHash).not.toBe(code);
    expect(await RoomJoinService.confirm(code, target)).toEqual({ joined: true });
    await expect(RoomJoinService.confirm(link, target)).rejects.toThrow();
    const lease = await prisma.tenancy.findFirstOrThrow({ where: { propertyId, status: 'ACTIVE' } });
    await TenantService.endTenancy(lease.id, owner);
    const next = await TenantService.inviteTenant(propertyId, owner, { name: marker, email: marker + '-target@example.test', roomId, startDate: '2026-10-15', monthlyRent: 2500 });
    link = next.inviteUrl;
    code = next.invitationCode;
  });
  test('unbound tenant cannot take a room without owner approval, and duplicate requests are idempotent', async () => {
    expect((await RoomJoinService.preview(link, requester)).needsApproval).toBe(true);
    expect(await RoomJoinService.confirm(link, requester)).toEqual({ joined: false });
    await RoomJoinService.confirm(code, requester);
    const requests = await RoomJoinService.tenantRequests(requester);
    expect(requests).toHaveLength(1);
    expect(await prisma.tenancy.count({ where: { tenantId: requester, status: 'ACTIVE' } })).toBe(0);
    await expect(RoomJoinService.review(requests[0].id, outsider, true)).rejects.toThrow('FORBIDDEN');
    await expect(RoomJoinService.propertyRequests(propertyId, outsider)).rejects.toThrow('FORBIDDEN');
    expect(await RoomJoinService.tenantRequests(target)).toHaveLength(0);
    expect(await RoomJoinService.review(requests[0].id, owner, true)).toEqual({ joined: true });
    expect(await prisma.tenancy.count({ where: { tenantId: requester, status: 'ACTIVE' } })).toBe(1);
    expect((await RoomJoinService.tenantRequests(requester))[0].status).toBe('APPROVED');
    await expect(RoomJoinService.confirm(code, target)).rejects.toThrow();
    await expect(RoomJoinService.review(requests[0].id, owner, false)).rejects.toThrow();
  });
  test('room links and QR codes are reusable without placeholder accounts, and approvals cannot overfill a room', async () => {
    const active = await prisma.tenancy.findFirstOrThrow({ where: { tenantId: requester, propertyId, status: 'ACTIVE' } });
    await TenantService.endTenancy(active.id, owner);
    const beforeUsers = await prisma.user.count({ where: { name: marker } });
    const links = await RoomShareService.links(propertyId, owner);
    expect(links).toHaveLength(1);
    const roomLink = links[0].invitationUrl;
    expect((await RoomShareService.links(propertyId, owner))[0].invitationUrl).toBe(roomLink);
    expect(await prisma.user.count({ where: { name: marker } })).toBe(beforeUsers);
    await expect(RoomShareService.links(propertyId, outsider)).rejects.toThrow('FORBIDDEN');
    const png = require('pngjs').PNG.sync.read(await QRCode.toBuffer(roomLink, { width: 256, margin: 4 }));
    const decoded = require('jsqr')(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded.data).toBe(roomLink);
    expect((await RoomJoinService.preview(decoded.data, target)).roomNumber).toBe('101');
    const forged = new URL(roomLink);
    forged.searchParams.set('token', '0'.repeat(64));
    await expect(RoomJoinService.preview(forged.toString(), target)).rejects.toThrow('Invalid room invitation');
    await RoomJoinService.confirm(roomLink, target);
    await RoomJoinService.confirm(roomLink, target);
    await RoomJoinService.confirm(roomLink, requester);
    expect(await prisma.roomAccessRequest.count({ where: { roomId } })).toBe(2);
    expect(await prisma.tenancy.count({ where: { roomId, status: 'ACTIVE' } })).toBe(0);
    const requests = await RoomShareService.propertyRequests(propertyId, owner);
    await expect(RoomShareService.review(requests[0].id, outsider, true)).rejects.toThrow('FORBIDDEN');
    const results = await Promise.allSettled(requests.map(request => RoomShareService.review(request.id, owner, true)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.tenancy.count({ where: { roomId, status: 'ACTIVE' } })).toBe(1);
    await expect(RoomJoinService.preview(roomLink, target)).rejects.toThrow('Room is full');
    const approved = await prisma.roomAccessRequest.findFirstOrThrow({ where: { roomId, status: 'APPROVED' } });
    await expect(RoomShareService.review(approved.id, owner, true)).rejects.toThrow('no longer pending');
    const pending = await prisma.roomAccessRequest.findFirstOrThrow({ where: { roomId, status: 'PENDING' } });
    await RoomShareService.review(pending.id, owner, false);
    expect((await RoomShareService.tenantRequests(pending.userId))[0].status).toBe('REJECTED');
  });
  afterAll(async () => {
    if (propertyId) {
      await prisma.roomAccessRequest.deleteMany({ where: { room: { propertyId } } });
      await prisma.notification.deleteMany({ where: { userId: { in: [owner, outsider, target, requester].filter(Boolean) } } });
      await prisma.roomJoinRequest.deleteMany({ where: { invite: { tenancy: { propertyId } } } });
      await prisma.inviteToken.deleteMany({ where: { tenancy: { propertyId } } });
      await prisma.tenancy.deleteMany({ where: { propertyId } });
      await prisma.room.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });
    }
    await prisma.tenantProfile.deleteMany({ where: { user: { name: marker } } });
    await prisma.user.deleteMany({ where: { name: marker } });
    await prisma.$disconnect();
  });
});
