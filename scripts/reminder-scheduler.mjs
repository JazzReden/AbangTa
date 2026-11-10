export function startReminderScheduler({
  url, secret, initialDelayMs = 15000, intervalMs = 300000, timeoutMs = 45000,
  fetchImpl = globalThis.fetch, logger = console,
}) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(target.hostname) ||
    target.pathname !== '/api/jobs/bill-reminders' || target.search || target.hash || target.username || target.password) {
    throw new Error('Automatic reminders require the local reminder endpoint.');
  }
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Reminder authorization must contain at least 32 characters.');
  for (const value of [initialDelayMs, intervalMs, timeoutMs]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) throw new Error('Invalid scheduler timing.');
  }
  let stopped = false, timer, controller, warned = false;
  function schedule(delay) {
    if (stopped) return;
    timer = setTimeout(tick, delay);
    timer.unref?.();
  }
  async function tick() {
    if (stopped) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), timeoutMs);
    timeout.unref?.();
    try {
      const response = await fetchImpl(target.href, {
        method: 'POST', redirect: 'error', cache: 'no-store',
        headers: { authorization: 'Bearer ' + secret }, signal: controller.signal,
      });
      if (response.status === 429) return;
      if (!response.ok) throw new Error('Reminder job failed.');
      const result = await response.json();
      if (!Number.isInteger(result.sent) || result.sent < 0 || result.sent > 100) throw new Error('Invalid reminder job response.');
      warned = false;
      if (result.sent > 0) logger.info(`[reminders] Sent ${result.sent} in-app bill reminder(s).`);
    } catch {
      if (!stopped && !warned) {
        logger.warn('[reminders] Server or reminder storage unavailable; automatic retry is scheduled.');
        warned = true;
      }
    } finally {
      clearTimeout(timeout);
      controller = undefined;
      schedule(intervalMs);
    }
  }
  schedule(initialDelayMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
  };
}
