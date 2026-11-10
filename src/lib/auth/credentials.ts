import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { checkRateLimit, resetRateLimit } from '@/lib/security/rate-limit';

export function normalizeIdentifier(value: string): { email: string | null; mobile: string | null } {
  const text = value.trim();
  if (text.includes('@')) return { email: z.string().email().max(191).parse(text.toLowerCase()), mobile: null };
  if (/[^\d+\s()-]/.test(text)) throw new Error('Enter a valid email or Philippine mobile number');
  const number = text.replace(/[\s()-]/g, '');
  if (!/^(?:\+?63|0)?9\d{9}$/.test(number)) throw new Error('Enter a valid email or Philippine mobile number');
  const local = number.replace(/^(?:\+?63|0)/, '');
  return { email: null, mobile: '+63' + local };
}

const identifier = z.string().min(1, 'Email or mobile number is required').max(254).refine(value => {
  try { normalizeIdentifier(value); return true; } catch { return false; }
}, 'Enter a valid email or Philippine mobile number');
const role = z.enum(['LANDLORD', 'TENANT']);
export const passwordAccountSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(100),
  identifier,
  password: z.string().min(8, 'Use at least 8 characters').max(72).refine(
    value => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long'
  ),
  role,
});
const passwordLoginSchema = z.object({
  identifier, password: z.string().min(1).max(72), role,
});

function throttleKey(prefix: string, value: string) {
  return prefix + createHash('sha256').update(value).digest('hex');
}

export async function registerPasswordAccount(raw: unknown) {
  const input = passwordAccountSchema.parse(raw);
  const identity = normalizeIdentifier(input.identifier);
  const key = throttleKey('register:', identity.email ?? identity.mobile!);
  if (!(await checkRateLimit(key, { limit: 5, windowMs: 15 * 60000 })).allowed) throw new Error('Too many attempts. Please try again later.');
  const existing = await prisma.user.findFirst({
    where: identity.email ? { email: identity.email } : { mobileLogin: identity.mobile },
  });
  if (existing) throw new Error('An account already uses this email or mobile number. Please sign in.');
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      name: input.name, email: identity.email, phone: identity.mobile,
      mobileLogin: identity.mobile, passwordHash, role: input.role,
      ...(input.role === 'LANDLORD' ? { landlordProfile: { create: {} } } : { tenantProfile: { create: {} } }),
    },
  });
}

// Public dummy hash keeps unknown-account comparisons at the same bcrypt cost.
const dummyHash = '$2a$12$fm0E/.PWS5EGSj85feyYvOqGc7PL6Cwxfdd.ahIMJ70I0U5mPApUe';
export async function findAccountForGoogle(email: string, signedInUserId?: string) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing || !signedInUserId) return existing;
  const current = await prisma.user.findUnique({ where: { id: signedInUserId } });
  // A signed-in mobile account can attach its own verified Google email.
  return current?.email === null ? current : null;
}

export async function authenticatePassword(raw: unknown) {
  const parsed = passwordLoginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const input = parsed.data;
  const identity = normalizeIdentifier(input.identifier);
  const key = throttleKey('login:', identity.email ?? identity.mobile!);
  if (!(await checkRateLimit(key)).allowed) return null;
  const user = identity.email
    ? await prisma.user.findUnique({ where: { email: identity.email } })
    : await prisma.user.findUnique({ where: { mobileLogin: identity.mobile! } });
  const hasPassword = Boolean(user && /^\$2[aby]\$/.test(user.passwordHash));
  const valid = await bcrypt.compare(input.password, hasPassword ? user!.passwordHash : dummyHash);
  if (!user || !hasPassword || !valid || user.role !== input.role) return null;
  await resetRateLimit(key);
  return { id: user.id, email: user.email, name: user.name, role: user.role, image: user.avatarUrl };
}
