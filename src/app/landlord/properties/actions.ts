'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, numericField, optionalString } from '@/lib/actions/form';
import {
  createPropertySchema,
  createRoomSchema,
  utilityConfigSchema,
  updateRoomStatusSchema,
} from '@/lib/validations';
import { PropertyService } from '@/services/properties/property.service';
import { RoomService } from '@/services/properties/room.service';
import { parseAdditionalCharges } from '@/lib/utils/additional-charges';

export async function savePropertyChargesAction(propertyId: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    if (!form.has('additionalCharges')) return { error: 'Monthly charge defaults are missing.' };
    await PropertyService.setBillingCharges(propertyId, user.id, parseAdditionalCharges(form.get('additionalCharges')));
    revalidatePath(`/landlord/properties/${propertyId}`);
    revalidatePath(`/landlord/properties/${propertyId}/bills/new`);
    return { success: 'Monthly charge defaults saved. Existing bills are unchanged.' };
  } catch (error) { return actionError(error); }
}

export async function createPropertyAction(formData: FormData) {
  const user = await requireLandlord();
  const parsed = createPropertySchema.safeParse({
    name: optionalString(formData.get('name')),
    address: optionalString(formData.get('address')),
    description: optionalString(formData.get('description')),
    contactPhone: optionalString(formData.get('contactPhone')),
    contactEmail: optionalString(formData.get('contactEmail')) ?? '',
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid property details');
  }

  const property = await PropertyService.create(user.id, parsed.data);
  revalidatePath('/landlord/properties');
  redirect(`/landlord/properties/${property.id}`);
}

export async function updatePropertyAction(propertyId: string, _state: { error?: string }, formData: FormData) {
  try {
    const user = await requireLandlord();
    const parsed = createPropertySchema.safeParse({
      name: optionalString(formData.get('name')),
      address: optionalString(formData.get('address')),
      description: optionalString(formData.get('description')),
      contactPhone: optionalString(formData.get('contactPhone')),
      contactEmail: optionalString(formData.get('contactEmail')) ?? '',
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid property details' };
    }
    await PropertyService.update(propertyId, user.id, parsed.data);
    revalidatePath(`/landlord/properties/${propertyId}`);
    revalidatePath('/landlord/properties');
    return { success: 'Property updated.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function archivePropertyAction(propertyId: string) {
  const user = await requireLandlord();
  await PropertyService.archive(propertyId, user.id);
  revalidatePath('/landlord/properties');
  redirect('/landlord/properties');
}

export async function createRoomAction(propertyId: string, _state: { error?: string }, formData: FormData) {
  try {
    const user = await requireLandlord();
    const parsed = createRoomSchema.safeParse({
      roomNumber: optionalString(formData.get('roomNumber')),
      rentalMode: optionalString(formData.get('rentalMode')) ?? 'WHOLE_ROOM',
      description: optionalString(formData.get('description')),
      capacity: Number(formData.get('capacity')),
      monthlyRent: Number(formData.get('monthlyRent')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid room details' };
    }
    await RoomService.create(propertyId, user.id, parsed.data);
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { success: 'Room added.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateRoomStatusAction(propertyId: string, roomId: string, formData: FormData) {
  const user = await requireLandlord();
  const parsed = updateRoomStatusSchema.safeParse({ status: formData.get('status') });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid room status');
  }
  await RoomService.updateStatus(roomId, user.id, parsed.data.status);
  revalidatePath(`/landlord/properties/${propertyId}`);
}

export async function saveRoomRentalAction(_propertyId: string, roomId: string, _state: { error?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    const input = createRoomSchema.pick({ rentalMode: true, capacity: true }).parse({ rentalMode: form.get('rentalMode'), capacity: Number(form.get('capacity')) });
    await RoomService.update(roomId, user.id, input);
    revalidatePath('/landlord', 'layout');
    return { success: 'Rental settings saved. Existing bills are unchanged.' };
  } catch (error) { return actionError(error); }
}

export async function saveBedAction(_propertyId: string, roomId: string, bedId: string | undefined, _state: { error?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    const status = String(form.get('status'));
    if (status !== 'VACANT' && status !== 'MAINTENANCE') return { error: 'Choose an available bed status.' };
    await RoomService.saveBed(roomId, user.id, bedId, { label: String(form.get('label') ?? ''), monthlyRent: Number(form.get('monthlyRent')), status });
    revalidatePath('/landlord', 'layout');
    return { success: 'Bed saved. Current tenants keep their agreed rent.' };
  } catch (error) { return actionError(error); }
}

export async function archiveBedAction(_propertyId: string, roomId: string, bedId: string, _state: { error?: string }) {
  try {
    const user = await requireLandlord();
    await RoomService.archiveBed(roomId, bedId, user.id);
    revalidatePath('/landlord', 'layout');
    return { success: 'Bed archived.' };
  } catch (error) { return actionError(error); }
}

export async function setUtilityConfigAction(
  propertyId: string,
  _state: { error?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    const billingMethod = String(formData.get('billingMethod'));
    const parsed = utilityConfigSchema.safeParse({
      utilityType: formData.get('utilityType'),
      billingMethod,
      fixedAmount:
        billingMethod === 'FIXED_RATE' ? numericField(formData.get('fixedAmount')) : undefined,
      ratePerUnit:
        billingMethod === 'METERED' ? numericField(formData.get('ratePerUnit')) : undefined,
      unit: billingMethod === 'METERED' ? optionalString(formData.get('unit')) : undefined,
      splitMethod: formData.get('splitMethod') ?? 'EQUAL_SPLIT',
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid utility configuration' };
    }
    await PropertyService.setUtilityConfig(propertyId, user.id, parsed.data);
    revalidatePath(`/landlord/properties/${propertyId}`);
    return { success: 'Utility configuration saved.' };
  } catch (error) {
    return actionError(error);
  }
}
