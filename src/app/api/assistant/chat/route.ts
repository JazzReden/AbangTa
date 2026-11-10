import { z } from 'zod';
import { assistantBody, assistantError, assistantHeaders, assistantUser } from '@/lib/assistant/http';
import { localPlan, planSchema } from '@/lib/assistant/contracts';
import { aiConfigured, resolveAssistantPlan } from '@/services/assistant/provider';
import { AssistantDataService } from '@/services/assistant/data.service';

export const runtime = 'nodejs';
const input = z.object({ question: z.string().trim().min(1).max(500), propertyId: z.string().max(64).optional(), refreshPlan: planSchema.optional(), previousPlan: planSchema.optional() }).strict();
export async function POST(request: Request) {
  try {
    const user = await assistantUser(request);
    const parsed = input.safeParse(await assistantBody(request));
    if (!parsed.success) throw new Error('Enter a question of up to 500 characters.');
    const contextual = localPlan(parsed.data.question, parsed.data.previousPlan);
    const resolved = parsed.data.refreshPlan ? { plan: parsed.data.refreshPlan, source: aiConfigured() ? 'Refreshed verified records' : 'Refreshed verified records - AI not configured' } : contextual.topic !== 'CLARIFY' ? { plan: contextual, source: aiConfigured() ? 'Verified records and app guidance' : 'Verified records and app guidance - AI not configured' } : await resolveAssistantPlan(parsed.data.question);
    const answer = await AssistantDataService.answer(user.id, resolved.plan, parsed.data.propertyId);
    return Response.json({ ...answer, source: resolved.source }, { headers: assistantHeaders });
  } catch (error) { return assistantError(error); }
}
