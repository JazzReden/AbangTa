import { z } from 'zod';
import Decimal from 'decimal.js';

export const additionalChargesSchema = z.array(z.object({
  itemType: z.enum(['WIFI', 'PARKING', 'OTHER']),
  description: z.string().trim().min(2).max(100),
  treatment: z.enum(['ADDITIONAL', 'INCLUDED', 'FREE']),
  amount: z.number().finite().nonnegative().max(99999999.99)
    .refine(value => new Decimal(value).decimalPlaces() <= 2, 'Use at most two decimal places'),
}).strict()).max(20).superRefine((items, ctx) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const key = item.itemType === 'OTHER' ? item.description.toLowerCase() : item.itemType;
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Remove duplicate additional charges' });
    seen.add(key);
    if (item.treatment === 'ADDITIONAL' ? item.amount <= 0 : item.amount !== 0) {
      ctx.addIssue({ code: 'custom', path: [index, 'amount'], message: 'Separate charges must be positive; included or free items must be zero' });
    }
    if (item.itemType === 'OTHER' && ['rent', 'water', 'electricity', 'wi-fi', 'wifi', 'parking'].includes(key)) {
      ctx.addIssue({ code: 'custom', path: [index, 'description'], message: 'Use the dedicated charge type instead' });
    }
  });
});

export type AdditionalCharge = z.infer<typeof additionalChargesSchema>[number];

export const propertyChargesSchema = additionalChargesSchema.refine(
  items => items.length <= 2 && items.every(item => item.itemType === 'WIFI' || item.itemType === 'PARKING'),
  'Property defaults support Wi-Fi and parking only'
);

export function propertyChargeDefaults(charges: Array<{
  itemType: 'WIFI' | 'PARKING'; treatment: AdditionalCharge['treatment']; amount: { toString(): string };
}>): AdditionalCharge[] {
  return charges.map(charge => ({
    itemType: charge.itemType, description: charge.itemType === 'WIFI' ? 'Wi-Fi' : 'Parking',
    treatment: charge.treatment, amount: Number(charge.amount.toString()),
  }));
}

export function parseAdditionalCharges(value: FormDataEntryValue | null) {
  if (value === null || value === '') return [];
  if (typeof value !== 'string' || value.length > 10000) throw new Error('Invalid additional charges');
  try {
    const parsed = additionalChargesSchema.safeParse(JSON.parse(value));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    return parsed.data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Invalid additional charges');
    throw error;
  }
}
