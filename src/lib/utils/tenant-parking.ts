import { z } from 'zod';
import type { AdditionalCharge } from './additional-charges';

export const tenantParkingSchema = z.enum(['USE_PROPERTY_RATE', 'FREE', 'NOT_APPLICABLE']);
export type TenantParkingMode = z.infer<typeof tenantParkingSchema>;

export function tenantCharges(charges: AdditionalCharge[], parkingMode: TenantParkingMode, explicitOverride = false): AdditionalCharge[] {
  const mode = tenantParkingSchema.parse(parkingMode);
  if (mode === 'USE_PROPERTY_RATE') return charges;
  if (explicitOverride && charges.some(charge => charge.itemType === 'PARKING' && charge.treatment === 'ADDITIONAL')) {
    throw new Error('This tenant is not assigned paid parking. Update their parking setting first.');
  }
  const remaining = charges.filter(charge => charge.itemType !== 'PARKING');
  return mode === 'FREE' ? [...remaining, { itemType: 'PARKING', description: 'Parking', treatment: 'FREE', amount: 0 }] : remaining;
}
