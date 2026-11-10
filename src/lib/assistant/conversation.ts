import type { AssistantAnswer } from './contracts';
import { manilaTimestamp } from './dates';

export function ishiWelcome(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(now));
  return `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}! I'm Ishi. What would you like to check?`;
}

export function conversationAnswer(question: string, audience: 'landlord' | 'tenant', now = new Date()): AssistantAnswer | null {
  const raw = question.toLowerCase().trim().replace(/[!.,?]+/g, ' ').replace(/\s+/g, ' ').trim();
  const q = raw.replace(/^(?:(?:hi|hello|hey)(?: there)?|good (?:morning|afternoon|evening))(?: ishi| bud)? (?=(?:how are you(?: doing)?|how's it going|kumusta|kamusta)(?: ishi| bud)?$)/, '');
  const greeting = /^(?:(?:hi|hello|hey)(?: there)?(?: ishi| bud)?|good (?:morning|afternoon|evening|night)(?: ishi| bud)?|maayong (?:buntag|hapon|gabii)(?: ishi)?)$/;
  const thanks = /^(?:thanks|thank you|salamat)(?: so much| kaayo)?(?: ishi| bud)?$/;
  const wellbeing = /^(?:how are you(?: doing)?|how's it going|kumusta|kamusta)(?: ishi| bud)?$/;
  let text: string;
  const ceb = /maayong|salamat|kumusta|kamusta/.test(q);
  const prompt = audience === 'tenant' ? 'your bills, payments, room or maintenance' : 'your bills, collections, rooms or maintenance';
  if (greeting.test(q)) text = ceb ? 'Maayong adlaw! Ako si Ishi. Unsay imong gustong susihon?' : ishiWelcome(now);
  else if (thanks.test(q)) text = ceb ? 'Walay sapayan! Naa ra ko kung naa kay laing pangutana.' : "You're welcome, bud! I'm here whenever you need another check.";
  else if (wellbeing.test(q)) text = ceb ? 'Naa ra ko, andam motabang! Unsay imong gustong susihon?' : `I'm here and ready to help, bud. Would you like to check ${prompt}?`;
  else return null;
  return { text, records: [], scope: audience === 'tenant' ? 'Your own tenant records only' : 'Your landlord workspace', range: 'Conversation; no financial report requested', asOf: manilaTimestamp(now), source: 'Conversation', plan: { topic: 'HELP', period: 'THIS_MONTH', language: ceb ? 'ceb' : 'en' } };
}

export function isTenantReport(topic: string) {
  return ['BILLING_HELP', 'UNPAID', 'OVERDUE', 'COLLECTIONS', 'PAYMENT_HELP', 'OCCUPANCY', 'MAINTENANCE'].includes(topic);
}
