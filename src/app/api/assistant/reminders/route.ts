import { z } from 'zod';
import { assistantBody, assistantError, assistantHeaders, assistantUser } from '@/lib/assistant/http';
import { AssistantReminders } from '@/services/assistant/reminders.service';
import { languageSchema } from '@/lib/assistant/contracts';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';
const input = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('preview'), billId: z.string().min(1).max(64), language: languageSchema, template: z.string().max(1000).optional() }).strict(),
  z.object({ operation: z.literal('send'), id: z.string().min(1).max(64), confirmed: z.literal(true) }).strict(),
  z.object({ operation: z.literal('schedule'), id: z.string().min(1).max(64), scheduledAt: z.string().datetime({ offset: true }), enabled: z.literal(true) }).strict(),
  z.object({ operation: z.literal('cancel'), id: z.string().min(1).max(64) }).strict(),
]);
export async function GET(request: Request) {
  try { const user = await assistantUser(request); return Response.json(await AssistantReminders.list(user.id), { headers: assistantHeaders }); }
  catch (error) { return assistantError(error); }
}
export async function POST(request: Request) {
  try {
    const user = await assistantUser(request), parsed = input.safeParse(await assistantBody(request));
    if (!parsed.success) throw new Error('Check the reminder details and confirmation.');
    const data = parsed.data;
    let result: unknown;
    if (data.operation === 'preview') result = await AssistantReminders.preview(user.id, data.billId, data.language, data.template);
    else if (data.operation === 'send') result = await AssistantReminders.send(user.id, data.id, data.confirmed);
    else if (data.operation === 'schedule') { await AssistantReminders.schedule(user.id, data.id, new Date(data.scheduledAt), data.enabled); result = { reason: 'Scheduled in-app delivery. Balance and payment proofs will be rechecked.' }; }
    else { await AssistantReminders.cancel(user.id, data.id); result = { reason: 'Schedule cancelled.' }; }
    revalidatePath('/tenant', 'layout');
    return Response.json(result, { headers: assistantHeaders });
  } catch (error) { return assistantError(error); }
}
