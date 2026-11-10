import { z } from 'zod';
import type { AssistantAnswer } from './contracts';
import { tenantPlanSchema, type TenantPlan } from './tenant-contracts';

const record = z.object({ label: z.string(), detail: z.string(), href: z.string().startsWith('/tenant/') }).strict();
const answer = z.object({ text: z.string(), scope: z.string(), range: z.string(), asOf: z.string(), source: z.string(), plan: tenantPlanSchema, records: z.array(record).max(20), truncated: z.boolean().optional() }).strict();
const responseSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/), answers: z.array(answer).min(1).max(6) }).strict();
const interval = 15000, maximumDelay = 300000;
type Snapshot = { plans: TenantPlan[]; apply: (answers: AssistantAnswer[]) => void };

export function startTenantAnswerRefresh({ snapshot, denied }: { snapshot: () => Snapshot | null; denied: () => void }) {
  let disposed = false, stopped = false, failures = 0, revision = '';
  let nextAllowed = Date.now() + interval;
  let timer: ReturnType<typeof setTimeout> | undefined, request: AbortController | undefined;
  const active = () => document.visibilityState === 'visible' && navigator.onLine !== false;
  function schedule() {
    clearTimeout(timer);
    if (!disposed && !stopped && active() && !request) timer = setTimeout(check, Math.max(0, nextAllowed - Date.now()));
  }
  async function check() {
    if (disposed || stopped || !active() || request) return;
    if (Date.now() < nextAllowed) { schedule(); return; }
    const view = snapshot();
    if (!view || !view.plans.length) { nextAllowed = Date.now() + interval; schedule(); return; }
    const controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    let delay = interval;
    try {
      const response = await fetch('/api/tenant/assistant/refresh', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plans: view.plans }) });
      if (disposed || controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { stopped = true; denied(); return; }
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        delay = Math.min(maximumDelay, Math.max(interval, Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60000)); return;
      }
      if (!response.ok) throw new Error('Update check failed');
      const data = responseSchema.parse(await response.json());
      if (data.answers.length !== view.plans.length || data.answers.some((a, i) => JSON.stringify(a.plan) !== JSON.stringify(view.plans[i]))) throw new Error('Mismatched report response');
      failures = 0;
      if (!disposed && !controller.signal.aborted && active() && data.revision !== revision) { view.apply(data.answers); revision = data.revision; }
    } catch {
      if (controller.signal.reason === 'inactive') delay = 0;
      else { failures = Math.min(5, failures + 1); delay = Math.min(maximumDelay, interval * 2 ** failures); }
    } finally { clearTimeout(timeout); request = undefined; nextAllowed = Date.now() + delay; schedule(); }
  }
  function activity() { if (!active()) { clearTimeout(timer); request?.abort('inactive'); } else schedule(); }
  document.addEventListener('visibilitychange', activity);
  window.addEventListener('focus', activity); window.addEventListener('online', activity); window.addEventListener('offline', activity);
  schedule();
  return () => {
    disposed = true; clearTimeout(timer); request?.abort();
    document.removeEventListener('visibilitychange', activity); window.removeEventListener('focus', activity); window.removeEventListener('online', activity); window.removeEventListener('offline', activity);
  };
}
