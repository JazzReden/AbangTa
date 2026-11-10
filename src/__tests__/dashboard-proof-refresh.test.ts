import { startDashboardProofRefresh } from '@/lib/billing/dashboard-proof-refresh';

const revision = 'a'.repeat(64), changed = 'b'.repeat(64);
let doc: EventTarget & { visibilityState: string }, win: EventTarget, network: { onLine: boolean };
let fetcher: jest.Mock, refresh: jest.Mock, stop: (() => void) | undefined;
const originals = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-18T00:00:00Z'));
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }); win = new EventTarget(); network = { onLine: true };
  fetcher = jest.fn().mockImplementation(async () => Response.json({ revision })); refresh = jest.fn();
  for (const [key, value] of Object.entries({ document: doc, window: win, navigator: network, fetch: fetcher })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
afterEach(() => {
  stop?.(); stop = undefined;
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
  originals.clear(); jest.useRealTimers();
});
function start() { stop = startDashboardProofRefresh({ revision, page: 2, refresh }); }
async function advance(ms: number) { await jest.advanceTimersByTimeAsync(ms); }

test('checks every 15 seconds, refreshes only changes, and sends private bounded-page requests', async () => {
  start(); await advance(14999); expect(fetcher).not.toHaveBeenCalled();
  await advance(1); expect(fetcher).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0][0]).toBe('/api/landlord/payment-proofs/revision?proofPage=2');
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
  fetcher.mockImplementation(async () => Response.json({ revision: changed })); await advance(15000);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('unchanged pages do not refresh and slow server refreshes are throttled until new props arrive', async () => {
  fetcher.mockImplementation(async () => Response.json({ revision: changed })); start();
  await advance(45000); expect(refresh).toHaveBeenCalledTimes(2);
  stop!(); stop = startDashboardProofRefresh({ revision: changed, page: 2, refresh });
  await advance(30000); expect(refresh).toHaveBeenCalledTimes(2);
});

test('hidden and offline tabs pause polling and resume without a manual reload', async () => {
  doc.visibilityState = 'hidden'; start(); await advance(60000); expect(fetcher).not.toHaveBeenCalled();
  doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange')); await advance(0);
  expect(fetcher).toHaveBeenCalledTimes(1);
  network.onLine = false; win.dispatchEvent(new Event('offline')); await advance(60000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  network.onLine = true; win.dispatchEvent(new Event('online')); await advance(0);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('focus storms cannot overlap a hung request; timeouts back off before retrying', async () => {
  fetcher.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new Error('Aborted')));
  }));
  start(); await advance(15000);
  for (let i = 0; i < 20; i++) win.dispatchEvent(new Event('focus'));
  await advance(7999); expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(1); expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  await advance(29999); expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(1); expect(fetcher).toHaveBeenCalledTimes(2);
});

test('unmount aborts requests, removes listeners and ignores late responses on review pages', async () => {
  let resolve!: (response: Response) => void;
  fetcher.mockImplementation(() => new Promise<Response>(done => { resolve = done; }));
  start(); await advance(15000); const signal = fetcher.mock.calls[0][1].signal;
  stop!(); stop = undefined; expect(signal.aborted).toBe(true);
  resolve(Response.json({ revision: changed })); await advance(0);
  win.dispatchEvent(new Event('focus')); doc.dispatchEvent(new Event('visibilitychange'));
  await advance(60000); expect(fetcher).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
});

test('shared rate-limit Retry-After cannot be bypassed by focus and online events', async () => {
  fetcher.mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  start(); await advance(15000);
  for (let i = 0; i < 10; i++) { win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('online')); }
  await advance(119999); expect(fetcher).toHaveBeenCalledTimes(1);
  await advance(1); expect(fetcher).toHaveBeenCalledTimes(2);
});

test('transient and invalid responses back off quietly and normal cadence recovers', async () => {
  fetcher.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ revision: 'invalid' }));
  start(); await advance(15000); await advance(30000); expect(fetcher).toHaveBeenCalledTimes(2);
  await advance(60000); expect(fetcher).toHaveBeenCalledTimes(3);
  await advance(15000); expect(fetcher).toHaveBeenCalledTimes(4); expect(refresh).not.toHaveBeenCalled();
});

test.each([401, 403])('expired or revoked access (%s) refreshes authentication once and stops polling', async status => {
  fetcher.mockResolvedValue(new Response(null, { status })); start(); await advance(15000);
  expect(refresh).toHaveBeenCalledTimes(1); win.dispatchEvent(new Event('focus')); await advance(300000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
