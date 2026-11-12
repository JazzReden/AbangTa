import { POST } from '@/app/api/jobs/bill-reminders/route';
import { OperationalHealth } from '@/services/operations/health.service';
import { AssistantReminders } from '@/services/assistant/reminders.service';
import { ReminderService } from '@/services/billing/reminder.service';
import { checkRateLimit } from '@/lib/security/rate-limit';
jest.mock('@/services/operations/health.service', () => ({ OperationalHealth: { started: jest.fn(), succeeded: jest.fn(), failed: jest.fn() } }));
jest.mock('@/services/assistant/reminders.service', () => ({ AssistantReminders: { runDue: jest.fn() } }));
jest.mock('@/services/billing/reminder.service', () => ({ ReminderService: { runDue: jest.fn() } }));
jest.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: jest.fn() }));
const original = process.env.BILL_REMINDERS_SECRET, secret = 'x'.repeat(40);
function request(authorized = true) { return new Request('http://localhost/api/jobs/bill-reminders', { method: 'POST', headers: authorized ? { authorization: 'Bearer ' + secret } : {} }); }
beforeEach(() => {
  jest.clearAllMocks(); process.env.BILL_REMINDERS_SECRET = secret;
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 0, retryAfterSec: 0 });
  jest.mocked(AssistantReminders.runDue).mockResolvedValue({ sent: 0, checked: 0, failed: 0 });
  jest.mocked(ReminderService.runDue).mockResolvedValue({ sent: 0, checked: 0 });
});
afterAll(() => { if (original === undefined) delete process.env.BILL_REMINDERS_SECRET; else process.env.BILL_REMINDERS_SECRET = original; });
test('unauthorized requests and another worker owning the rate limit never write health', async () => {
  expect((await POST(request(false))).status).toBe(401);
  jest.mocked(checkRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSec: 60 });
  expect((await POST(request())).status).toBe(429);
  expect(OperationalHealth.started).not.toHaveBeenCalled(); expect(OperationalHealth.failed).not.toHaveBeenCalled();
});
test('partial reminder delivery failure marks the run unhealthy instead of recording success', async () => {
  jest.mocked(AssistantReminders.runDue).mockResolvedValueOnce({ sent: 1, checked: 2, failed: 1 });
  expect((await POST(request())).status).toBe(503);
  expect(OperationalHealth.failed).toHaveBeenCalled(); expect(OperationalHealth.succeeded).not.toHaveBeenCalled();
});
test('successful empty runs refresh heartbeat and database failures fail safely', async () => {
  expect((await POST(request())).status).toBe(200); expect(OperationalHealth.succeeded).toHaveBeenCalled();
  jest.mocked(checkRateLimit).mockRejectedValueOnce(new Error('fixture database outage'));
  const response = await POST(request()); expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('fixture database outage'); expect(OperationalHealth.failed).toHaveBeenCalled();
});
