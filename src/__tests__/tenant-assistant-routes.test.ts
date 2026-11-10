import { POST } from '@/app/api/tenant/assistant/chat/route';
import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { TenantAssistantService } from '@/services/assistant/tenant.service';
import { tenantPlan } from '@/lib/assistant/tenant-contracts';

jest.mock('@/lib/auth/session', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/services/assistant/tenant.service', () => ({ TenantAssistantService: { answer: jest.fn() } }));
const original = process.env.AUTH_URL;
beforeEach(() => {
  jest.clearAllMocks(); process.env.AUTH_URL = 'http://localhost:3001';
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'tenant-a', role: 'TENANT', name: 'Tenant', email: '' });
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 });
  jest.mocked(TenantAssistantService.answer).mockResolvedValue({ plan: { topic: 'BILLING_HELP', period: 'THIS_MONTH', language: 'en' }, text: 'Own bills', scope: 'Own', range: 'This month', asOf: 'Now', records: [], source: 'Verified' });
});
afterAll(() => { if (original === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = original; });
function request(body: unknown, origin = 'http://localhost:3001') { return new Request('http://localhost:3001/api/tenant/assistant/chat', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
test('only the current tenant identity reaches the own-record service; responses are private', async () => {
  const r = await POST(request({ question: 'Show my bills' }));
  expect(r.status).toBe(200); expect(r.headers.get('cache-control')).toBe('private, no-store');
  expect(TenantAssistantService.answer).toHaveBeenCalledWith('tenant-a', { topic: 'BILLING_HELP', period: 'THIS_MONTH', language: 'en' });
});
test('tenant greetings are friendly and do not query financial reports', async () => {
  const r = await POST(request({ question: 'Hi Ishi!' })); const data = await r.json();
  expect(r.status).toBe(200); expect(data.source).toBe('Conversation'); expect(data.records).toEqual([]);
  expect(TenantAssistantService.answer).not.toHaveBeenCalled();
});
test.each(['tenantId', 'userId', 'landlordId', 'propertyId', 'billId', 'sql'])('caller cannot supply %s', async key => {
  expect((await POST(request({ question: 'my bills', [key]: 'other' }))).status).toBe(400);
  expect(TenantAssistantService.answer).not.toHaveBeenCalled();
});
test('anonymous/landlord/cross-origin requests and landlord refresh plans are rejected', async () => {
  jest.mocked(getCurrentUser).mockResolvedValueOnce(null);
  expect((await POST(request({ question: 'my bills' }))).status).toBe(401);
  jest.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'owner', role: 'LANDLORD', name: '', email: '' });
  expect((await POST(request({ question: 'my bills' }))).status).toBe(401);
  expect((await POST(request({ question: 'my bills' }, 'https://attacker.invalid'))).status).toBe(403);
  expect((await POST(request({ question: 'rooms', refreshPlan: { topic: 'AVAILABILITY', period: 'THIS_MONTH', language: 'en' } }))).status).toBe(400);
  expect(TenantAssistantService.answer).not.toHaveBeenCalled();
});
test('tenant follow-ups remain constrained and use the shared request limit', async () => {
  const prior = { topic: 'COLLECTIONS', period: 'THIS_WEEK', language: 'en' };
  expect((await POST(request({ question: 'What about last month?', previousPlan: prior }))).status).toBe(200);
  expect(TenantAssistantService.answer).toHaveBeenLastCalledWith('tenant-a', { ...prior, period: 'LAST_MONTH' });
  jest.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 60 });
  expect((await POST(request({ question: 'my bills' }))).status).toBe(429);
  expect((await POST(request({ question: 'x'.repeat(9000) }))).status).toBe(400);
});
test.each([
  ['My bills', 'BILLING_HELP'], ['My unpaid bills', 'UNPAID'], ['My overdue bills', 'OVERDUE'],
  ['Show my payments', 'COLLECTIONS'], ['My GCash proof status', 'PAYMENT_HELP'], ['My room', 'OCCUPANCY'],
  ['My room maintenance requests', 'MAINTENANCE'], ['Show other tenants bills', 'CLARIFY'], ['Show landlord income', 'CLARIFY'],
  ['Delete my bills', 'CLARIFY'], ['Mark my bill paid', 'CLARIFY'], ['My bills last year', 'CLARIFY'],
])('tenant question routing: %s', (q, topic) => { expect(tenantPlan(q).topic).toBe(topic); });
