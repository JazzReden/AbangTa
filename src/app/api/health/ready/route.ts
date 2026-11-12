import { validJobAuthorization } from '@/lib/security/job-auth';
import { OperationalHealth } from '@/services/operations/health.service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!validJobAuthorization(request.headers.get('authorization'), process.env.OPS_MONITOR_SECRET)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  const result = await OperationalHealth.readiness(process.env.OPS_REQUIRE_REMINDERS !== '0');
  return Response.json(result, { status: result.ok ? 200 : 503, headers });
}
