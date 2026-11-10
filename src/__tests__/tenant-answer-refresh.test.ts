import { startTenantAnswerRefresh } from '@/lib/assistant/tenant-answer-refresh';

const plan = { topic: 'UNPAID', period: 'THIS_MONTH', language: 'en' } as const;
const report = { plan, text: 'Your remaining balance is PHP 100.', scope: 'Own', range: 'This month', asOf: 'Now', source: 'Verified', records: [{ label: 'Your bill', detail: 'Own balance', href: '/tenant/bills' }] };
const revision = 'a'.repeat(64), changed = 'b'.repeat(64);
let doc: EventTarget & { visibilityState: string }, win: EventTarget, network: { onLine: boolean };
let fetcher: jest.Mock, apply: jest.Mock, denied: jest.Mock, snapshot: jest.Mock, stop: (() => void) | undefined;
const originals = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-18T00:00:00Z'));
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }); win = new EventTarget(); network = { onLine: true };
  fetcher = jest.fn().mockImplementation(async () => Response.json({ revision, answers: [report] }));
  apply = jest.fn(); denied = jest.fn(); snapshot = jest.fn(() => ({ plans: [plan], apply }));
  for (const [key, value] of Object.entries({ document: doc, window: win, navigator: network, fetch: fetcher })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
afterEach(() => {
  stop?.(); stop = undefined;
  for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  originals.clear(); jest.useRealTimers();
});
function start() { stop = startTenantAnswerRefresh({ snapshot, denied }); }
async function advance(ms: number) { await jest.advanceTimersByTimeAsync(ms); }

test('quiet 15-second private checks replace changed content only, never append chat messages', async () => {
  start(); await advance(14999); expect(fetcher).not.toHaveBeenCalled();
  await advance(1); expect(apply).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/tenant/assistant/refresh');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ plans: [plan] });
  await advance(15000); expect(apply).toHaveBeenCalledTimes(1);
  fetcher.mockImplementation(async () => Response.json({ revision: changed, answers: [{ ...report, text: 'Updated balance' }] }));
  await advance(15000); expect(apply).toHaveBeenCalledTimes(2);
});
test('greeting-only chats or an active manual request do not make background calls', async () => {
  snapshot.mockReturnValue(null); start(); await advance(60000); expect(fetcher).not.toHaveBeenCalled();
  snapshot.mockReturnValue({ plans: [plan], apply }); await advance(15000); expect(fetcher).toHaveBeenCalledTimes(1);
});
test('hidden/offline tabs pause checks and reconnect without reload or focus storms', async () => {
  doc.visibilityState = 'hidden'; start(); await advance(60000); expect(fetcher).not.toHaveBeenCalled();
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await advance(0); expect(fetcher).toHaveBeenCalledTimes(1);
  network.onLine = false; win.dispatchEvent(new Event('offline')); await advance(60000); expect(fetcher).toHaveBeenCalledTimes(1);
  network.onLine = true; win.dispatchEvent(new Event('online')); await advance(0); expect(fetcher).toHaveBeenCalledTimes(2);
  for (let i = 0; i < 10; i++) win.dispatchEvent(new Event('focus'));
  await advance(14999); expect(fetcher).toHaveBeenCalledTimes(2);
});
test('closing aborts work, removes listeners and ignores late private answers', async () => {
  let resolve!: (r: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  start(); await advance(15000); const signal = fetcher.mock.calls[0][1].signal;
  stop!(); stop = undefined; expect(signal.aborted).toBe(true);
  resolve(Response.json({ revision, answers: [report] })); await advance(0);
  win.dispatchEvent(new Event('focus')); await advance(60000); expect(fetcher).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
});
test('timeouts do not overlap and back off before retrying', async () => {
  fetcher.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => { options.signal!.addEventListener('abort', () => reject(new Error('Aborted'))); }));
  start(); await advance(15000); for (let i = 0; i < 20; i++) win.dispatchEvent(new Event('focus'));
  await advance(12000); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await advance(29999); expect(fetcher).toHaveBeenCalledTimes(1); await advance(1); expect(fetcher).toHaveBeenCalledTimes(2);
});
test('rate-limit Retry-After survives focus/online events', async () => {
  fetcher.mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '120' } })); start(); await advance(15000);
  for (let i = 0; i < 10; i++) { win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('online')); }
  await advance(119999); expect(fetcher).toHaveBeenCalledTimes(1); await advance(1); expect(fetcher).toHaveBeenCalledTimes(2);
});
test('malformed or mismatched replies cannot replace the report, and normal cadence recovers', async () => {
  fetcher.mockResolvedValueOnce(Response.json({ revision, answers: [{ ...report, plan: { ...plan, topic: 'OCCUPANCY' } }] }))
    .mockResolvedValueOnce(Response.json({ revision, answers: [{ ...report, records: [{ label: 'Wrong', detail: 'x', href: '/landlord/properties' }] }] }));
  start(); await advance(15000); expect(apply).not.toHaveBeenCalled(); await advance(30000); expect(apply).not.toHaveBeenCalled();
  await advance(60000); expect(apply).toHaveBeenCalledTimes(1); await advance(15000); expect(fetcher).toHaveBeenCalledTimes(4);
});
test.each([401, 403])('revoked access (%s) clears access once and stops polling', async status => {
  fetcher.mockResolvedValue(new Response(null, { status })); start(); await advance(15000); expect(denied).toHaveBeenCalledTimes(1);
  win.dispatchEvent(new Event('focus')); await advance(300000); expect(fetcher).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
});
