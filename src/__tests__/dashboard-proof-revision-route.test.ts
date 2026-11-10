import { GET } from '@/app/api/landlord/payment-proofs/revision/route';
import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { PaymentProofService } from '@/services/billing/payment-proof.service';
import { pendingProofRevision } from '@/lib/security/payment-proof-revision';

jest.mock('@/lib/auth/session', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/services/billing/payment-proof.service', () => ({ PaymentProofService: { getPendingForLandlord: jest.fn() } }));
const user = jest.mocked(getCurrentUser), limit = jest.mocked(checkRateLimit), pending = jest.mocked(PaymentProofService.getPendingForLandlord);
beforeEach(() => {
  jest.clearAllMocks();
  user.mockResolvedValue({ id: 'owner', name: 'Owner', email: 'fixture@example.test', role: 'LANDLORD' });
  limit.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSec: 0 });
  pending.mockResolvedValue({ total: 0, page: 1, pages: 1, proofs: [] });
});
function request(page = '1') { return GET(new Request('http://localhost/api/landlord/payment-proofs/revision?proofPage=' + page)); }

test('anonymous and tenant requests cannot access revision data', async () => {
  user.mockResolvedValueOnce(null);
  expect((await request()).status).toBe(401);
  user.mockResolvedValueOnce({ id: 'tenant', name: 'Tenant', email: '', role: 'TENANT' });
  expect((await request()).status).toBe(403);
  expect(pending).not.toHaveBeenCalled(); expect(limit).not.toHaveBeenCalled();
});
test('endpoint returns only an owner-specific fingerprint and private no-store headers', async () => {
  const response = await request('2'), data = await response.json();
  expect(response.status).toBe(200); expect(Object.keys(data)).toEqual(['revision']); expect(data.revision).toMatch(/^[a-f0-9]{64}$/);
  expect(response.headers.get('cache-control')).toBe('private, no-store'); expect(response.headers.get('vary')).toBe('Cookie');
  expect(pending).toHaveBeenCalledWith('owner', 2);
  expect(limit).toHaveBeenCalledWith('dashboard-proof-check:owner', { limit: 60, windowMs: 60000 });
  const queue = { total: 0, page: 1, pages: 1, proofs: [] };
  expect(pendingProofRevision('owner', queue)).not.toBe(pendingProofRevision('outsider', queue));
  expect(pendingProofRevision('owner', queue)).not.toBe(pendingProofRevision('owner', { ...queue, total: 1 }));
});
test('shared rate limits return Retry-After without running the queue query', async () => {
  limit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 42 });
  const response = await request(); expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('42');
  expect(pending).not.toHaveBeenCalled();
});
test('malformed page values fall back safely', async () => {
  await request('Infinity'); expect(pending).toHaveBeenLastCalledWith('owner', 1);
  await request('-3'); expect(pending).toHaveBeenLastCalledWith('owner', 1);
});
test('database and security-check failures expose no internal details', async () => {
  pending.mockRejectedValueOnce(new Error('Private database credentials'));
  const response = await request(); expect(response.status).toBe(503); expect(await response.text()).not.toContain('credentials');
});
