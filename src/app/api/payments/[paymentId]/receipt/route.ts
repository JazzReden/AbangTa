import { getCurrentUser } from '@/lib/auth/session';
import { ReceiptService } from '@/services/billing/receipt.service';
import { paymentReceiptPdf } from '@/lib/pdf/payment-receipt';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';
export async function GET(_request: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Sign in to download your receipt.' }, { status: 401, headers });
    const { paymentId } = await params;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(paymentId)) return Response.json({ error: 'Receipt not available.' }, { status: 404, headers });
    if (!(await checkRateLimit('receipt-download:' + user.id, { limit: 30, windowMs: 60000 })).allowed) return Response.json({ error: 'Too many downloads. Please wait a minute.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    const receipt = await ReceiptService.getForUser(paymentId, user.id);
    if (!receipt) return Response.json({ error: 'Receipt not available.' }, { status: 404, headers });
    const bytes = await paymentReceiptPdf(receipt);
    return new Response(Buffer.from(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${receipt.number}.pdf"` } });
  } catch { return Response.json({ error: 'Unable to download the receipt right now.' }, { status: 503, headers }); }
}
