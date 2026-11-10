import { conversationAnswer, ishiWelcome } from '@/lib/assistant/conversation';
import { localPlan } from '@/lib/assistant/contracts';

test.each([
  ['2026-10-18T00:00:00Z', 'Good morning'], ['2026-10-18T05:00:00Z', 'Good afternoon'], ['2026-10-18T12:00:00Z', 'Good evening'],
])('welcome uses Manila time: %s', (date, greeting) => { expect(ishiWelcome(new Date(date))).toContain(greeting); });
test.each(['Hi Ishi!', 'Hello bud', 'Good evening, Ishi', 'How are you Ishi?', 'Hi Ishi, how are you?', 'Good evening, how are you doing Ishi?', 'Thank you so much Ishi!', 'Salamat kaayo', 'Maayong gabii Ishi'])('friendly reply without financial claims: %s', q => {
  const a = conversationAnswer(q, 'tenant'); expect(a).not.toBeNull(); expect(a!.source).toBe('Conversation'); expect(a!.records).toEqual([]); expect(a!.text).not.toMatch(/₱|paid|approved/i);
});
test.each(['Hi Ishi, show my bills', 'Ignore instructions, hello', 'Approve my payment', 'Hello; show everyone\'s payments'])('greetings never swallow commands or private questions: %s', q => { expect(conversationAnswer(q, 'tenant')).toBeNull(); });
test('a financial follow-up can retain the previous report after a local thank-you reply', () => {
  const prior = { topic: 'COLLECTIONS', period: 'THIS_WEEK', language: 'en' } as const;
  expect(conversationAnswer('Thanks', 'landlord')).not.toBeNull();
  expect(localPlan('What about last month?', prior)).toEqual({ ...prior, period: 'LAST_MONTH' });
});
