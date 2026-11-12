import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOperations } from './operations-check.mjs';
const base = { url: 'http://127.0.0.1:3000/api/health/ready', secret: 'x'.repeat(32) };
test('monitor authenticates, refuses redirects and accepts only a healthy readiness response', async () => {
  const result = await checkOperations({ ...base, fetchImpl: async (_url, request) => {
    assert.equal(request.redirect, 'error'); assert.equal(request.headers.authorization, 'Bearer ' + base.secret);
    return { ok: true, status: 200, json: async () => ({ ok: true, database: 'ok', reminders: 'ok' }) };
  } }); assert.equal(result.ok, true);
});
test('monitor fails closed on stale jobs, outages, unauthorized and malformed responses', async () => {
  for (const response of [{ ok: false, status: 503 }, { ok: false, status: 401 }, { ok: true, status: 200, json: async () => ({ ok: false }) }]) {
    assert.equal((await checkOperations({ ...base, fetchImpl: async () => response })).ok, false);
  }
  assert.equal((await checkOperations({ ...base, fetchImpl: async () => { throw new Error(base.secret); } })).event, 'operations.unreachable');
});
test('monitor rejects insecure remote origins and credentials in URLs', async () => {
  for (const url of ['http://example.com/api/health/ready', 'https://user:pass@example.com/api/health/ready', 'https://example.com/api/health/ready?token=secret']) await assert.rejects(checkOperations({ ...base, url }));
});
