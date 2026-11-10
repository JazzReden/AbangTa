import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { accountFlowError, type AuthIntent } from './intent';

export const googleIdentitySchema = z.object({
  email_verified: z.literal(true),
  email: z.string().trim().email().max(191).transform(value => value.toLowerCase()),
  sub: z.string().min(1).max(191),
  name: z.string().max(100).optional(),
  picture: z.string().url().max(2048).optional(),
});

export async function googleAccount(raw: unknown, intent: AuthIntent, persist = false) {
  const profile = googleIdentitySchema.parse(raw);
  return prisma.$transaction(async tx => {
    // Serialize linking with the account row; a different verified identity must
    // never overwrite an existing Google subject during simultaneous callbacks.
    if (intent.linkUserId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${intent.linkUserId} FOR UPDATE`;
    const bySubject = await tx.user.findUnique({ where: { googleSubject: profile.sub } });
    const byEmail = await tx.user.findUnique({ where: { email: profile.email } });
    let user = bySubject ?? byEmail;
    if (bySubject && byEmail && bySubject.id !== byEmail.id) throw new Error('identity-mismatch');
    if (intent.linkUserId) {
      const current = await tx.user.findUnique({ where: { id: intent.linkUserId } });
      if (!current || (user && user.id !== current.id) ||
        (current.email && current.email.toLowerCase() !== profile.email && current.googleSubject !== profile.sub)) throw new Error('identity-mismatch');
      user = current;
    }
    const reason = accountFlowError(intent, user, profile.sub);
    if (reason) throw new Error(reason);
    if (!persist) return user;
    if (!user) return tx.user.create({ data: {
      email: profile.email, name: profile.name || profile.email.split('@')[0], role: intent.role,
      googleSubject: profile.sub, passwordHash: randomBytes(48).toString('hex'), avatarUrl: profile.picture,
      ...(intent.role === 'LANDLORD' ? { landlordProfile: { create: {} } } : { tenantProfile: { create: {} } }),
    } });
    if (!user.googleSubject) {
      const linked = await tx.user.updateMany({ where: { id: user.id, googleSubject: null }, data: { googleSubject: profile.sub, ...(user.email ? {} : { email: profile.email }) } });
      if (linked.count !== 1) throw new Error('identity-mismatch');
      return tx.user.findUniqueOrThrow({ where: { id: user.id } });
    }
    return user;
  }, { isolationLevel: 'ReadCommitted' });
}
