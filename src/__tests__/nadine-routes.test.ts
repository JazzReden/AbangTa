import { POST as chat } from '@/app/api/assistant/chat/route';
import { POST as reminder, GET as deliveries } from '@/app/api/assistant/reminders/route';
import { getCurrentUser } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { AssistantDataService } from '@/services/assistant/data.service';
import { AssistantReminders } from '@/services/assistant/reminders.service';
import { resolveAssistantPlan } from '@/services/assistant/provider';

jest.mock('@/lib/auth/session', () => ({ getCurrentUser: jest.fn() }));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }));
jest.mock('@/services/assistant/data.service', () => ({ AssistantDataService: { answer: jest.fn() } }));
jest.mock('@/services/assistant/provider', () => ({ resolveAssistantPlan: jest.fn(), aiConfigured: jest.fn(() => false) }));
jest.mock('@/services/assistant/reminders.service', () => ({ AssistantReminders: { preview: jest.fn(), send: jest.fn(), schedule: jest.fn(), cancel: jest.fn(), list: jest.fn() } }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
const plan = { topic: 'UNPAID', period: 'THIS_MONTH', language: 'en' } as const;
const originalUrl = process.env.AUTH_URL;
beforeEach(() => {
  jest.clearAllMocks(); process.env.AUTH_URL = 'http://localhost:3001';
  jest.mocked(getCurrentUser).mockResolvedValue({ id: 'owner', role: 'LANDLORD', name: 'Test', email: '' });
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 19, retryAfterSec: 0 });
  jest.mocked(resolveAssistantPlan).mockResolvedValue({ plan, source: 'Verified records' });
  jest.mocked(AssistantDataService.answer).mockResolvedValue({ text: 'Verified', scope: 'Own records', range: 'Today', asOf: 'Now', source: 'Verified', plan, records: [] });
});
afterAll(() => { if (originalUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = originalUrl; });
function request(body: unknown, origin = 'http://localhost:3001') { return new Request('http://localhost:3001/api/assistant/chat', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

test('assistant rejects anonymous, tenant, cross-origin and caller-supplied landlord identities', async () => {
  jest.mocked(getCurrentUser).mockResolvedValueOnce(null);
  expect((await chat(request({ question: 'unpaid' }))).status).toBe(401);
  jest.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'tenant', role: 'TENANT', name: '', email: '' });
  expect((await chat(request({ question: 'unpaid' }))).status).toBe(401);
  expect((await chat(request({ question: 'unpaid' }, 'https://attacker.invalid'))).status).toBe(403);
  expect((await chat(request({ question: 'unpaid', landlordId: 'other' }))).status).toBe(400);
  expect(AssistantDataService.answer).not.toHaveBeenCalled(); expect(resolveAssistantPlan).not.toHaveBeenCalled();
});
test('only authenticated identity reaches data tools; explicit refresh bypasses AI calls', async () => {
  const response = await chat(request({ question: 'Who has unpaid rent?', propertyId: 'own-property', refreshPlan: plan }));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(AssistantDataService.answer).toHaveBeenCalledWith('owner', plan, 'own-property');
  expect(resolveAssistantPlan).not.toHaveBeenCalled();
});
test('bounded requests, invalid plans and shared rate limits fail without querying records', async () => {
  expect((await chat(request({ question: 'x'.repeat(9000) }))).status).toBe(400);
  expect((await chat(request({ question: 'hello', refreshPlan: { ...plan, topic: 'SQL' } }))).status).toBe(400);
  jest.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 10 });
  expect((await chat(request({ question: 'unpaid' }))).status).toBe(429);
  expect(AssistantDataService.answer).not.toHaveBeenCalled();
});
test('follow-ups reuse only validated read-only plans under the current authenticated identity', async () => {
  const previousPlan = { topic: 'COLLECTIONS', period: 'THIS_WEEK', language: 'en' };
  expect((await chat(request({ question: 'What about last month?', previousPlan }))).status).toBe(200);
  expect(AssistantDataService.answer).toHaveBeenCalledWith('owner', { ...previousPlan, period: 'LAST_MONTH' }, undefined);
  expect(resolveAssistantPlan).not.toHaveBeenCalled();
  expect((await chat(request({ question: 'last month', previousPlan: { ...previousPlan, landlordId: 'other' } }))).status).toBe(400);
});
test('reminders need a separate preview and explicit delivery/schedule confirmation', async () => {
  expect((await reminder(request({ operation: 'send', id: 'draft', confirmed: false }))).status).toBe(400);
  expect((await reminder(request({ operation: 'schedule', id: 'draft', scheduledAt: '2026-10-25T10:00:00+08:00', enabled: false }))).status).toBe(400);
  expect(AssistantReminders.send).not.toHaveBeenCalled(); expect(AssistantReminders.schedule).not.toHaveBeenCalled();
  jest.mocked(AssistantReminders.preview).mockResolvedValue({ id: 'draft', template: 'Test', message: 'Test', pendingProof: false, expiresAt: new Date().toISOString() });
  expect((await reminder(request({ operation: 'preview', billId: 'bill', language: 'ceb' }))).status).toBe(200);
  expect(AssistantReminders.preview).toHaveBeenCalledWith('owner', 'bill', 'ceb', undefined);
});
test('delivery history remains private and database failures do not expose secrets', async () => {
  jest.mocked(AssistantReminders.list).mockResolvedValue([]);
  expect((await deliveries(new Request('http://localhost:3001/api/assistant/reminders'))).status).toBe(200);
  expect(AssistantReminders.list).toHaveBeenCalledWith('owner');
  jest.mocked(AssistantDataService.answer).mockRejectedValueOnce(new TypeError('Private database credentials'));
  const response = await chat(request({ question: 'unpaid' })); expect(await response.text()).not.toContain('credentials');
});
