import { z } from 'zod';
import { assistantBody, assistantError, assistantHeaders, assistantUser } from '@/lib/assistant/http';
import { tenantPlan, tenantPlanSchema } from '@/lib/assistant/tenant-contracts';
import { TenantAssistantService } from '@/services/assistant/tenant.service';
import { conversationAnswer } from '@/lib/assistant/conversation';

export const runtime = 'nodejs';
const input = z.object({ question: z.string().trim().min(1).max(500), previousPlan: tenantPlanSchema.optional(), refreshPlan: tenantPlanSchema.optional() }).strict();
export async function POST(request: Request) {
  try {
    const user = await assistantUser(request, 'TENANT');
    const parsed = input.safeParse(await assistantBody(request));
    if (!parsed.success) throw new Error('Ask about your own bills, payments, room or maintenance.');
    const greeting = !parsed.data.refreshPlan && conversationAnswer(parsed.data.question, 'tenant');
    if (greeting) return Response.json(greeting, { headers: assistantHeaders });
    const plan = parsed.data.refreshPlan ?? tenantPlan(parsed.data.question, parsed.data.previousPlan);
    return Response.json(await TenantAssistantService.answer(user.id, plan), { headers: assistantHeaders });
  } catch (error) { return assistantError(error); }
}
