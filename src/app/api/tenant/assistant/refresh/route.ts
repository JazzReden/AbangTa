import { z } from 'zod';
import { assistantBody, assistantError, assistantHeaders, assistantUser } from '@/lib/assistant/http';
import { tenantPlanSchema } from '@/lib/assistant/tenant-contracts';
import { isTenantReport } from '@/lib/assistant/conversation';
import { refreshTenantAnswers } from '@/services/assistant/tenant-refresh.service';

export const runtime = 'nodejs';
const input = z.object({ plans: z.array(tenantPlanSchema.refine(plan => isTenantReport(plan.topic))).min(1).max(6) }).strict();
export async function POST(request: Request) {
  try {
    const user = await assistantUser(request, 'TENANT');
    const parsed = input.safeParse(await assistantBody(request));
    if (!parsed.success) throw new Error('Refresh up to six of your own supported reports.');
    return Response.json(await refreshTenantAnswers(user.id, parsed.data.plans), { headers: assistantHeaders });
  } catch (error) { return assistantError(error); }
}
