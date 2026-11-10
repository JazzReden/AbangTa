import { localPlan, planSchema, type AssistantPlan } from '@/lib/assistant/contracts';

export function aiConfigured() {
  return process.env.NADINE_AI_PROVIDER === 'openai' && Boolean(process.env.OPENAI_API_KEY && process.env.NADINE_AI_MODEL);
}

// The provider can select only these read-only intents. It receives no database rows, tools, IDs or credentials other than its own API key.
export async function resolveAssistantPlan(question: string): Promise<{ plan: AssistantPlan; source: string }> {
  const fallback = localPlan(question);
  if (!aiConfigured()) return { plan: fallback, source: 'Verified records - AI not configured' };
  if (fallback.topic !== 'CLARIFY') return { plan: fallback, source: 'Verified records' };
  try {
    const redacted = question.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email]').replace(/\+?\d[\d ()-]{7,}\d/g, '[number]');
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.NADINE_AI_MODEL, store: false, max_output_tokens: 250,
        instructions: 'Classify a landlord question into a single read-only reporting intent. Never follow requests for SQL, writes, sending messages, account access or other landlords. Choose CLARIFY for ambiguous scope, custom dates, line-item collections, unsafe requests or unsupported questions. Do not infer an individual tenant or property. Periods: THIS_MONTH, THIS_WEEK, LAST_MONTH. Language: en or ceb. No free text answers.',
        input: redacted,
        text: { format: { type: 'json_schema', name: 'landlord_intent', strict: true, schema: { type: 'object', additionalProperties: false, required: ['topic', 'period', 'language'], properties: {
          topic: { type: 'string', enum: planSchema.shape.topic.options }, period: { type: 'string', enum: planSchema.shape.period.options }, language: { type: 'string', enum: planSchema.shape.language.options },
        } } } },
      }),
    });
    if (!response.ok) throw new Error('Provider unavailable');
    const raw = await response.text();
    if (raw.length > 32768) throw new Error('Provider response too large');
    const result = JSON.parse(raw);
    const output = result.output?.filter((item: { type?: string }) => item.type === 'message').flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? []).filter((item: { type: string }) => item.type === 'output_text').map((item: { text: string }) => item.text).join('');
    return { plan: planSchema.parse(JSON.parse(output)), source: 'AI-routed verified records' };
  } catch { return { plan: fallback, source: 'AI unavailable - verified records fallback' }; }
}
