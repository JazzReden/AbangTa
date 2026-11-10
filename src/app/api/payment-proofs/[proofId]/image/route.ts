import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { PaymentProofService } from '@/services/billing/payment-proof.service';

export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ proofId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' };
  try {
    const user = await getCurrentUser();
    if (!user) return new Response(null, { status: 401, headers });
    const { proofId } = await params;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(proofId)) return new Response(null, { status: 404, headers });
    if (!(await checkRateLimit('proof-view:' + user.id, { limit: 60, windowMs: 60000 })).allowed) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    const proof = await PaymentProofService.imageForUser(proofId, user.id);
    if (!proof) return new Response(null, { status: 404, headers });
    return new Response(Buffer.from(proof.image), { headers: { ...headers, 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="gcash-proof.jpg"' } });
  } catch { return new Response(null, { status: 503, headers }); }
}
