import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { pendingProofRevision } from '@/lib/security/payment-proof-revision';
import { PaymentProofService } from '@/services/billing/payment-proof.service';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers });
    if (user.role !== 'LANDLORD') return Response.json({ error: 'Not available.' }, { status: 403, headers });
    const limit = await checkRateLimit('dashboard-proof-check:' + user.id, { limit: 60, windowMs: 60000 });
    if (!limit.allowed) return Response.json({ error: 'Please wait before checking again.' }, { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSec) } });
    const value = new URL(request.url).searchParams.get('proofPage') ?? '1';
    const page = /^\d{1,6}$/.test(value) ? Number(value) : 1;
    const queue = await PaymentProofService.getPendingForLandlord(user.id, page);
    return Response.json({ revision: pendingProofRevision(user.id, queue) }, { headers });
  } catch { return Response.json({ error: 'Unable to check for updates right now.' }, { status: 503, headers }); }
}
