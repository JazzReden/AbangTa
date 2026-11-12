import { GET } from '@/app/api/health/ready/route';
import { OperationalHealth } from '@/services/operations/health.service';
import { operationEvent } from '@/lib/operations/events';
jest.mock('@/services/operations/health.service', () => ({ OperationalHealth: { readiness: jest.fn() } }));
const secret = 'readiness-test-' + 'x'.repeat(32);
const original = process.env.OPS_MONITOR_SECRET;
beforeEach(() => { jest.clearAllMocks(); process.env.OPS_MONITOR_SECRET = secret; });
afterAll(() => { if (original === undefined) delete process.env.OPS_MONITOR_SECRET; else process.env.OPS_MONITOR_SECRET = original; });
test('readiness details require a separate monitor credential', async () => {
  const response = await GET(new Request('http://localhost/api/health/ready'));
  expect(response.status).toBe(401); expect(OperationalHealth.readiness).not.toHaveBeenCalled();
});
test('unhealthy checks return noncacheable 503 without leaking secrets', async () => {
  jest.mocked(OperationalHealth.readiness).mockResolvedValue({ ok: false, database: 'unavailable', reminders: 'unknown' });
  const response = await GET(new Request('http://localhost/api/health/ready', { headers: { authorization: 'Bearer ' + secret } }));
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.text()).not.toContain(secret);
});
test('operational logs allowlist codes and exclude arbitrary exception messages', () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { operationEvent('database.error', { code: 'P1001', message: secret }); expect(log).toHaveBeenCalledWith(expect.stringContaining('P1001')); expect(log.mock.calls.flat().join('')).not.toContain(secret); } finally { log.mockRestore(); }
});
