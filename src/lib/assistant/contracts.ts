import { z } from 'zod';

export const topicSchema = z.enum(['UNPAID', 'OVERDUE', 'AVAILABILITY', 'COLLECTIONS', 'MAINTENANCE', 'OCCUPANCY', 'PAYMENT_HELP', 'BILLING_HELP', 'FUNDS_HELP', 'REMINDER_HELP', 'INVITE_HELP', 'HELP', 'CLARIFY']);
export const periodSchema = z.enum(['THIS_MONTH', 'THIS_WEEK', 'LAST_MONTH']);
export const languageSchema = z.enum(['en', 'ceb']);
export const planSchema = z.object({ topic: topicSchema, period: periodSchema, language: languageSchema }).strict();
export type AssistantPlan = z.infer<typeof planSchema>;
export type AssistantRecord = { label: string; detail: string; href: string; billId?: string; pendingProof?: boolean };
export type AssistantAnswer = { text: string; scope: string; range: string; asOf: string; source: string; records: AssistantRecord[]; plan: AssistantPlan; truncated?: boolean };

export function localPlan(question: string, previous?: AssistantPlan): AssistantPlan {
  const q = question.toLowerCase().trim().replace(/[’]/g, "'").replace(/^(?:hi|hello|hey)[,!\s]+(?=\S)/, '');
  const language = /cebuano|bisaya|bisayan|\bceb\b/.test(q) ? 'ceb' : 'en';
  const period = /last month|previous month|miaging bulan/.test(q) ? 'LAST_MONTH' : /this week|weekly|karong semana/.test(q) ? 'THIS_WEEK' : 'THIS_MONTH';
  let topic: AssistantPlan['topic'] = 'CLARIFY';
  if (/^(?:and |what about |how about |same (?:report )?(?:for )?)?(?:last month|previous month|this month|this week|karong semana|miaging bulan|karong bulan)[?.!]*$/.test(q) && previous && ['UNPAID', 'COLLECTIONS'].includes(previous.topic)) return { topic: previous.topic, period, language: previous.language };
  if (/^(?:in |sa )?(?:bisaya|cebuano|english)(?: please)?[?.!]*$/.test(q) && previous) return { ...previous, language: /english/.test(q) ? 'en' : 'ceb' };
  if (/delete|execute|\bsql\b|other landlord|ignore.*instruct|approve.*payment|confirm.*payment|mark.*paid/.test(q) && !/how (?:do|can|to)|unsaon/.test(q)) return { topic, period, language };
  const how = /how (?:do|can|to|does)|why|explain|unsaon|what (?:is|are)|difference|help.*with|tell me about/.test(q);
  if (how && /deposit|advance|refund/.test(q)) topic = 'FUNDS_HELP';
  else if (how && /wi-?fi|parking|electric|water|utility|utilities|monthly bill|generate.*bill|bill.*calculat/.test(q)) topic = 'BILLING_HELP';
  else if (how && /remind|schedule|pahinumdom/.test(q)) topic = 'REMINDER_HELP';
  else if (how && /invit|join|qr|tenant.*link/.test(q)) topic = 'INVITE_HELP';
  else if (how && /gcash|cash|payment|receipt|proof/.test(q)) topic = 'PAYMENT_HELP';
  else if (/^(hi|hello|hey|thanks|thank you|salamat|maayong (buntag|hapon|gabii))[!.?]*$|what can you (do|answer)|help me get started|who are you/.test(q)) topic = 'HELP';
  if (topic !== 'CLARIFY') return { topic, period, language };
  const unpaid = /unpaid|overdue|past due|late (?:bill|payment|balance)|not paid|hasn't paid|haven't paid|\bowes?\b|outstanding|wala.*(?:bayad|kabayad)|remind|pahinumdom/;
  const available = /available|availability|vacant|vacancies|empty (?:room|bed)|(?:rooms?|beds?).*(?:empty|free)|free (?:room|bed)|bakante/;
  const collected = /collect|received|nakolekta|income|money (?:came|coming) in|payments? received/;
  const maintenance = /maintenance|repair|\bayohon\b|\bayo\b|leak|broken|unresolved (?:issue|request)/;
  const occupied = /occup|who (?:lives|stays)|pila.*(?:nagpuyo|tenant)/;
  const intents = [unpaid, available, collected, maintenance, occupied].filter(pattern => pattern.test(q)).length;
  if (intents > 1 || /\byesterday\b|\byear\b|\bbetween\b|\bnext week\b|\bjanuary\b|\bfebruary\b|\bmarch\b|\bapril\b|\b(?:in|for) may\b|\bjune\b|\bjuly\b|\baugust\b|\bseptember\b|\boctober\b|\bnovember\b|\bdecember\b|\b20\d{2}\b/.test(q) || (collected.test(q) || unpaid.test(q)) && /\btoday\b/.test(q)) return { topic, period, language };
  if (/electricity.*collect|collect.*electricity|water.*collect|collect.*water|rent.*collect|collect.*rent|\bdue (this|next|last) (week|month)|\d{4}-\d{2}-\d{2}|next month|last week/.test(q)) return { topic, period, language };
  if (/overdue|past due|late (?:bill|payment|balance)|lapas.*due/.test(q)) topic = 'OVERDUE';
  else if (unpaid.test(q)) topic = 'UNPAID';
  else if (available.test(q)) topic = 'AVAILABILITY';
  else if (collected.test(q)) topic = 'COLLECTIONS';
  else if (maintenance.test(q)) topic = 'MAINTENANCE';
  else if (occupied.test(q)) topic = 'OCCUPANCY';
  return { topic, period, language };
}
