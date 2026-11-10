import { POST } from '@/app/api/tenant/assistant/refresh/route';
import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { refreshTenantAnswers } from '@/services/assistant/tenant-refresh.service';

jest.mock('@/lib/auth/session', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/services/assistant/tenant-refresh.service', () => ({ refreshTenantAnswers: jest.fn() }));
const plan = { topic: 'BILLING_HELP', period: 'THIS_MONTH', language: 'en' }, original = process.env.AUTH_URL;
beforeEach(() => {
  jest.clearAllMocks(); process.env.AUTH_URL = 'http://localhost:3001';
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'tenant-a', role: 'TENANT', name: '', email: '' });
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 });
  jest.mocked(refreshTenantAnswers).mockResolvedValue({ revision: 'a'.repeat(64), answers: [] });
});
afterAll(() => { if (original === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = original; });
function request(body: unknown, origin = 'http://localhost:3001') { return new Request('http://localhost:3001/api/tenant/assistant/refresh', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
test('batch refresh uses only the signed-in tenant and private responses', async () => {
  const r = await POST(request({ plans: [plan] })); expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(refreshTenantAnswers).toHaveBeenCalledWith('tenant-a', [plan]);
});
test('guessed identities, landlord topics, greeting plans and oversized batches never reach tools', async () => {
  for (const body of [{ plans: [plan], tenantId: 'other' }, { plans: [{ ...plan, propertyId: 'other' }] }, { plans: [{ ...plan, topic: 'AVAILABILITY' }] }, { plans: [{ ...plan, topic: 'HELP' }] }, { plans: [] }, { plans: Array(7).fill(plan) }]) expect((await POST(request(body))).status).toBe(400);
  expect(refreshTenantAnswers).not.toHaveBeenCalled();
});
test('anonymous, landlords, foreign origins and exhausted shared limits are rejected', async () => {
  jest.mocked(getCurrentUser).mockResolvedValueOnce(null); expect((await POST(request({ plans: [plan] }))).status).toBe(401);
  jest.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'owner', role: 'LANDLORD', name: '', email: '' }); expect((await POST(request({ plans: [plan] }))).status).toBe(401);
  expect((await POST(request({ plans: [plan] }, 'https://attacker.invalid'))).status).toBe(403);
  jest.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 60 }); expect((await POST(request({ plans: [plan] }))).status).toBe(429);
  expect(refreshTenantAnswers).not.toHaveBeenCalled();
});
