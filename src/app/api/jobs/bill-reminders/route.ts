import { OperationalHealth } from '@/services/operations/health.service';
import { ReminderService } from '@/services/billing/reminder.service';
import { validJobAuthorization } from '@/lib/security/job-auth';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { AssistantReminders } from '@/services/assistant/reminders.service';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!process.env.BILL_REMINDERS_SECRET || process.env.BILL_REMINDERS_SECRET.length < 32) return Response.json({ error: 'Reminder scheduling is not configured.' }, { status: 503, headers });
  if (!validJobAuthorization(request.headers.get('authorization'), process.env.BILL_REMINDERS_SECRET)) return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    if (!(await checkRateLimit('reminder-job', { limit: 1, windowMs: 60000 })).allowed) return Response.json({ error: 'Please wait before running again.' }, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
    await OperationalHealth.started();
    const assistant = await AssistantReminders.runDue();
    const result = await ReminderService.runDue();
    if (assistant.failed > 0) throw new Error('Some scheduled reminders could not be delivered.');
    await OperationalHealth.succeeded();
    return Response.json({ ...result, assistant }, { headers });
  } catch (error) { await OperationalHealth.failed(error); return Response.json({ error: 'Reminder processing is temporarily unavailable.' }, { status: 503, headers }); }
}
