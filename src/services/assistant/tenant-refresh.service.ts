import { createHash } from 'node:crypto';
import { TenantAssistantService } from './tenant.service';
import type { TenantPlan } from '@/lib/assistant/tenant-contracts';
import { formatDateInput } from '@/lib/utils/dates';

export async function refreshTenantAnswers(userId: string, plans: TenantPlan[], now = new Date()) {
  const cache = new Map<string, Awaited<ReturnType<typeof TenantAssistantService.answer>>>();
  const answers = [];
  for (const plan of plans) {
    const key = JSON.stringify(plan);
    let answer = cache.get(key);
    if (!answer) { answer = await TenantAssistantService.answer(userId, plan, now); cache.set(key, answer); }
    answers.push(answer);
  }
  // Volatile query timestamps are not content changes. A Manila date change still invalidates periods.
  const revision = createHash('sha256').update(JSON.stringify([userId, formatDateInput(now), answers.map(a => [a.plan, a.scope, a.text, a.records, a.truncated ?? false])])).digest('hex');
  return { revision, answers };
}
