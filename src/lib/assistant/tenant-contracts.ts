import { z } from 'zod';
import { periodSchema, languageSchema } from './contracts';

export const tenantPlanSchema = z.object({
  topic: z.enum(['BILLING_HELP', 'UNPAID', 'OVERDUE', 'COLLECTIONS', 'PAYMENT_HELP', 'OCCUPANCY', 'MAINTENANCE', 'HELP', 'CLARIFY']),
  period: periodSchema, language: languageSchema,
}).strict();
export type TenantPlan = z.infer<typeof tenantPlanSchema>;

export function tenantPlan(question: string, previous?: TenantPlan): TenantPlan {
  const q = question.toLowerCase().trim();
  const period = /last month|previous month|miaging bulan/.test(q) ? 'LAST_MONTH' : /this week|karong semana/.test(q) ? 'THIS_WEEK' : 'THIS_MONTH';
  const language = /bisaya|cebuano/.test(q) ? 'ceb' : 'en';
  const base: TenantPlan = { topic: 'CLARIFY', period, language };
  if (/other tenant|other people|everyone|all tenants|landlord.*(?:collect|income)|\bsql\b|delete|ignore.*instruct|mark.*paid|approve.*payment/.test(q)) return base;
  if (previous && /^(?:what about |how about |and )?(?:this month|last month|previous month|this week|karong semana|miaging bulan)[?.!]*$/.test(q) && ['BILLING_HELP', 'UNPAID', 'COLLECTIONS'].includes(previous.topic)) return { ...previous, period };
  if (previous && /^(?:in |sa )?(?:bisaya|cebuano|english)(?: please)?[?.!]*$/.test(q)) return { ...previous, language: /english/.test(q) ? 'en' : 'ceb' };
  if (/\byesterday\b|\byear\b|\btoday\b|\bbetween\b|last week|next (?:week|month)|\b20\d{2}\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\b(?:in|for) may\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b/.test(q)) return base;
  const groups = [/bill|balance|owe|unpaid|overdue|bayad|rent|wi-?fi|parking|electric|water/, /payment|receipt|\bpaid\b|gcash|proof/, /room|bed|assignment|kuwarto|kama/, /maintenance|repair|leak|broken|ayo/];
  // A payment-proof question can mention its bill; a repair can mention its room.
  const hits = groups.map(p => p.test(q));
  if (hits[3] && !hits[1] && !hits[0]) return { ...base, topic: 'MAINTENANCE' };
  if (hits[1] && !hits[3] && !hits[2] && (!hits[0] || /proof|gcash|receipt/.test(q))) return { ...base, topic: /proof|gcash/.test(q) ? 'PAYMENT_HELP' : 'COLLECTIONS' };
  if (hits.filter(Boolean).length > 1) return base;
  if (hits[0]) return { ...base, topic: /overdue|past due|late/.test(q) ? 'OVERDUE' : /owe|balance|unpaid|wala.*bayad/.test(q) ? 'UNPAID' : 'BILLING_HELP' };
  if (hits[2]) return { ...base, topic: 'OCCUPANCY' };
  if (/^(hi|hello|hey|thanks|salamat)[!.?]*$|what can you|help|who are you/.test(q)) return { ...base, topic: 'HELP' };
  return base;
}
