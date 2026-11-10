import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const AUTH_INTENT_COOKIE = 'abangta.auth-intent';
const intentSchema = z.object({
  role: z.enum(['LANDLORD', 'TENANT']),
  mode: z.enum(['signin', 'register']),
  returnTo: z.string(),
  expiresAt: z.number().finite(),
  linkUserId: z.string().optional(),
});
export type AuthIntent = z.infer<typeof intentSchema>;

export function safeReturnTo(value?: string) {
  if (!value || !value.startsWith('/join?') || value.length > 512) return '/onboarding';
  try {
    const url = new URL(value, 'https://local.invalid');
    const token = url.searchParams.get('token');
    const room = url.searchParams.get('room');
    if (url.pathname !== '/join' || url.hash || !token || !/^[a-f0-9]{64}$/.test(token) ||
      url.searchParams.getAll('token').length !== 1 || url.searchParams.getAll('room').length > 1 ||
      [...url.searchParams.keys()].some(key => !['token', 'room'].includes(key)) ||
      (room !== null && !/^[a-zA-Z0-9_-]{1,64}$/.test(room))) return '/onboarding';
    return '/join?' + new URLSearchParams({ token, ...(room ? { room } : {}) }).toString();
  } catch { return '/onboarding'; }
}

export function signAuthIntent(intent: AuthIntent, secret: string) {
  if (!secret) throw new Error('Authentication is not configured');
  const data = intentSchema.parse(intent);
  const payload = Buffer.from(JSON.stringify({ ...data, returnTo: safeReturnTo(data.returnTo) })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

export function readAuthIntent(value: string | undefined, secret: string, now = Date.now()): AuthIntent | null {
  if (!value || !secret || value.length > 2000) return null;
  const parts = value.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const data = intentSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    if (data.expiresAt <= now || data.expiresAt > now + 15 * 60 * 1000 || data.returnTo !== safeReturnTo(data.returnTo)) return null;
    return data;
  } catch { return null; }
}

export function accountFlowError(
  intent: AuthIntent,
  existing: { id?: string; passwordHash?: string; role: 'LANDLORD' | 'TENANT'; googleSubject: string | null } | null,
  googleSubject: string
): 'wrong-role' | 'create-account' | 'account-exists' | 'identity-mismatch' | 'password-first' | null {
  if (existing?.googleSubject && existing.googleSubject !== googleSubject) return 'identity-mismatch';
  if (existing && existing.role !== intent.role) return 'wrong-role';
  if (existing && !existing.googleSubject && existing.passwordHash?.startsWith('$2') && intent.linkUserId !== existing.id) return 'password-first';
  if (!existing && intent.mode === 'signin') return 'create-account';
  if (existing?.googleSubject && intent.mode === 'register') return 'account-exists';
  return null;
}
