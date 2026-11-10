const interval = 15000;
const maximumDelay = 300000;

// Kept separate from React so timer, network and lifecycle behavior can be tested deterministically.
export function startDashboardProofRefresh({ revision, page, refresh }: { revision: string; page: number; refresh: () => void }) {
  let disposed = false, stopped = false, failures = 0;
  let nextAllowed = Date.now() + interval;
  let lastRefresh = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  const active = () => document.visibilityState === 'visible' && navigator.onLine !== false;
  function schedule() {
    clearTimeout(timer);
    if (!disposed && !stopped && active() && !request) timer = setTimeout(check, Math.max(0, nextAllowed - Date.now()));
  }
  async function check() {
    if (disposed || stopped || !active() || request) return;
    if (Date.now() < nextAllowed) { schedule(); return; }
    const controller = new AbortController();
    request = controller;
    nextAllowed = Date.now() + 5000;
    const timeout = setTimeout(() => controller.abort(), 8000);
    let delay = interval;
    try {
      const response = await fetch('/api/landlord/payment-proofs/revision?proofPage=' + page, {
        credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
      });
      if (disposed || stopped || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        stopped = true;
        refresh();
        return;
      }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        delay = Math.min(maximumDelay, Math.max(interval, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000));
        return;
      }
      if (!response.ok) throw new Error('Update check failed');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('revision' in data) || typeof data.revision !== 'string' || !/^[a-f0-9]{64}$/.test(data.revision)) throw new Error('Invalid update response');
      failures = 0;
      if (!disposed && !controller.signal.aborted && active() && data.revision !== revision && Date.now() - lastRefresh >= 30000) {
        lastRefresh = Date.now();
        refresh();
      }
    } catch {
      if (controller.signal.reason === 'inactive') delay = 0;
      else { failures = Math.min(failures + 1, 5); delay = Math.min(maximumDelay, interval * 2 ** failures); }
    } finally {
      clearTimeout(timeout);
      request = undefined;
      nextAllowed = Math.max(nextAllowed, Date.now() + delay);
      schedule();
    }
  }
  function activity() {
    if (!active()) { clearTimeout(timer); request?.abort('inactive'); }
    else schedule();
  }
  document.addEventListener('visibilitychange', activity);
  window.addEventListener('focus', activity);
  window.addEventListener('online', activity);
  window.addEventListener('offline', activity);
  schedule();
  return () => {
    disposed = true;
    clearTimeout(timer);
    request?.abort();
    document.removeEventListener('visibilitychange', activity);
    window.removeEventListener('focus', activity);
    window.removeEventListener('online', activity);
    window.removeEventListener('offline', activity);
  };
}
