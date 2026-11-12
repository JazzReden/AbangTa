import { pathToFileURL } from 'node:url';

export async function checkOperations({ url, secret, fetchImpl = fetch }) {
  const target = new URL(url);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/api/health/ready' ||
    (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)))) throw new Error('Use HTTPS or loopback HTTP readiness URL without credentials or query.');
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Configure OPS_MONITOR_SECRET with at least 32 characters.');
  try {
    const response = await fetchImpl(target.href, { headers: { authorization: 'Bearer ' + secret }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { ok: false, event: 'operations.unhealthy', status: response.status };
    const result = await response.json();
    return result?.ok === true && result.database === 'ok' && ['ok', 'disabled'].includes(result.reminders)
      ? { ok: true, event: 'operations.healthy', status: 200 } : { ok: false, event: 'operations.invalid-response', status: response.status };
  } catch { return { ok: false, event: 'operations.unreachable', status: 0 }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkOperations({ url: process.env.OPS_HEALTH_URL, secret: process.env.OPS_MONITOR_SECRET });
    console.log(JSON.stringify({ ...result, at: new Date().toISOString() }));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.error('Configure OPS_HEALTH_URL and OPS_MONITOR_SECRET in the monitor environment.');
    process.exitCode = 2;
  }
}
