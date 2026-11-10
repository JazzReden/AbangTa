import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { startReminderScheduler } from './reminder-scheduler.mjs';

const secret = 'test-only-' + 'x'.repeat(32);
const options = { url: 'http://127.0.0.1:3001/api/jobs/bill-reminders', secret, initialDelayMs: 1, intervalMs: 5, timeoutMs: 1000, logger: { info() {}, warn() {} } };
function event() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function until(promise) {
  let timer;
  try { await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Scheduler did not run')), 2000); })]); }
  finally { clearTimeout(timer); }
}

test('scheduler starts automatically, authorizes locally and never overlaps requests', async () => {
  const started = event(), second = event();
  let calls = 0, release;
  const stop = startReminderScheduler({ ...options, fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url, options.url); assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, 'Bearer ' + secret); assert.equal(request.redirect, 'error');
    if (calls === 1) { started.resolve(); await new Promise(done => { release = done; }); }
    else second.resolve();
    return { ok: true, status: 200, json: async () => ({ sent: 0 }) };
  } });
  try {
    await until(started.promise); await sleep(25); assert.equal(calls, 1);
    release(); await until(second.promise);
  } finally { release?.(); stop(); }
});

test('temporary failures retry without leaking the secret or throwing out of the loop', async () => {
  const retried = event(), logs = [];
  let calls = 0;
  const stop = startReminderScheduler({ ...options, logger: { info: message => logs.push(message), warn: message => logs.push(message) }, fetchImpl: async () => {
    if (++calls === 1) throw new Error(secret);
    retried.resolve(); return { ok: true, status: 200, json: async () => ({ sent: 1 }) };
  } });
  try { await until(retried.promise); } finally { stop(); }
  assert.ok(logs.some(line => line.includes('retry')));
  assert.ok(logs.every(line => !line.includes(secret)));
});

test('shutdown cancels an active request and stops all future ticks', async () => {
  const started = event(); let calls = 0, signal;
  const stop = startReminderScheduler({ ...options, fetchImpl: async (_url, request) => {
    calls++; signal = request.signal; started.resolve();
    await new Promise(resolve => request.signal.addEventListener('abort', resolve, { once: true }));
    return { ok: false, status: 429 };
  } });
  await until(started.promise); stop(); assert.equal(signal.aborted, true);
  await sleep(25); assert.equal(calls, 1);
});

test('another instance owning the shared job limit is a quiet skip, not a failure', async () => {
  const retried = event(); let calls = 0, warnings = 0;
  const stop = startReminderScheduler({ ...options, logger: { info() {}, warn() { warnings++; } }, fetchImpl: async () => {
    if (++calls === 1) return { ok: false, status: 429 };
    retried.resolve(); return { ok: true, status: 200, json: async () => ({ sent: 0 }) };
  } });
  try { await until(retried.promise); } finally { stop(); }
  assert.equal(warnings, 0);
});

test('authorization never goes to an external or redirected endpoint', () => {
  for (const url of ['https://evil.test/api/jobs/bill-reminders', 'http://127.0.0.1:3001/other', 'http://127.0.0.1:3001/api/jobs/bill-reminders?secret=x']) {
    assert.throws(() => startReminderScheduler({ ...options, url }));
  }
  assert.throws(() => startReminderScheduler({ ...options, secret: 'short' }));
  assert.throws(() => startReminderScheduler({ ...options, intervalMs: 0 }));
});

test('a hung request times out and a later tick recovers', async () => {
  const recovered = event(); let calls = 0;
  const stop = startReminderScheduler({ ...options, timeoutMs: 10, fetchImpl: async (_url, request) => {
    if (++calls === 1) await new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
    recovered.resolve(); return { ok: true, status: 200, json: async () => ({ sent: 0 }) };
  } });
  try { await until(recovered.promise); } finally { stop(); }
  assert.ok(calls >= 2);
});
