import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const assistantHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export async function assistantUser(request: Request, role: 'LANDLORD' | 'TENANT' = 'LANDLORD') {
  const user = await getCurrentUser();
  if (!user || user.role !== role) throw new Error('UNAUTHORIZED');
  if (request.method !== 'GET' && request.headers.get('origin') !== new URL(process.env.AUTH_URL ?? request.url).origin) throw new Error('FORBIDDEN');
  if (!(await checkRateLimit('nadine:' + user.id, { limit: 20, windowMs: 60000 })).allowed) throw new Error('Too many requests. Please try again in a minute.');
  return user;
}
export async function assistantBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Use a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Request is empty.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new Error('Request is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new Error('Enter a valid request of up to 8 KB.'); }
}
export function assistantError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : message.startsWith('Too many') ? 429 : 400;
  const safe = error instanceof Error && !error.name.includes('Prisma') && !(error instanceof TypeError) && !(error instanceof SyntaxError) && !/credentials|DATABASE_URL|prisma\./i.test(message) ? message : 'Unable to complete this request right now.';
  return Response.json({ error: status === 401 ? 'Sign in with an authorized account to use Ishi.' : status === 403 ? 'This record is not available.' : safe }, { status, headers: { ...assistantHeaders, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
}
