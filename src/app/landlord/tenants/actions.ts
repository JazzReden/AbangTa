'use server';

import { revalidatePath } from 'next/cache';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, numericField, optionalString } from '@/lib/actions/form';
import { inviteTenantSchema } from '@/lib/validations';
import { TenantService } from '@/services/tenants/tenant.service';
import QRCode from 'qrcode';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { RoomJoinService } from '@/services/tenants/room-join.service';
import { RoomShareService } from '@/services/tenants/room-share.service';
import { tenantParkingSchema } from '@/lib/utils/tenant-parking';

export async function setTenantParkingAction(propertyId: string, tenancyId: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    const parsed = tenantParkingSchema.safeParse(form.get('parkingMode'));
    if (!parsed.success) return { error: 'Choose a valid parking setting.' };
    await TenantService.setParkingMode(propertyId, tenancyId, user.id, parsed.data);
    revalidatePath(`/landlord/properties/${propertyId}/tenants`);
    revalidatePath(`/landlord/properties/${propertyId}/bills/new`);
    return { success: 'Parking updated for future bills. Existing bills are unchanged.' };
  } catch (error) { return actionError(error); }
}

export async function reviewRoomAccessAction(requestId: string, approve: boolean, _state: { error?: string; success?: string }, _form: FormData) {
  try {
    const user = await requireLandlord();
    if (approve && _form.get('confirm') !== 'on') return { error: 'Confirm the tenant and room assignment before approving.' };
    await RoomShareService.review(requestId, user.id, approve, optionalString(_form.get('bedId')));
    revalidatePath('/landlord', 'layout');
    revalidatePath('/tenant', 'layout');
    return { success: approve ? 'Room assignment approved.' : 'Join request declined.' };
  } catch (error) { return actionError(error); }
}

export async function inviteTenantAction(
  propertyId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    if (!(await checkRateLimit('invite-create:' + user.id, { limit: 20, windowMs: 60000 })).allowed) {
      return { error: 'Too many invitations. Please wait a minute.' };
    }
    const parsed = inviteTenantSchema.safeParse({
      name: optionalString(formData.get('name')),
      email: optionalString(formData.get('email')),
      phone: optionalString(formData.get('phone')),
      roomId: optionalString(formData.get('roomId')),
      bedId: optionalString(formData.get('bedId')),
      startDate: optionalString(formData.get('startDate')),
      monthlyRent: Number(formData.get('monthlyRent')),
      securityDeposit: numericField(formData.get('securityDeposit')),
      notes: optionalString(formData.get('notes')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid tenant details' };
    }

    const result = await TenantService.inviteTenant(propertyId, user.id, parsed.data);
    revalidatePath(`/landlord/properties/${propertyId}`);
    revalidatePath(`/landlord/properties/${propertyId}/tenants`);
    return {
      success: 'Invitation created. It expires in 48 hours.',
      invitationUrl: result.inviteUrl,
      invitationCode: result.invitationCode,
      qrCode: await QRCode.toDataURL(result.inviteUrl, { width: 256, margin: 4 }),
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function endTenancyAction(propertyId: string, tenancyId: string) {
  const user = await requireLandlord();
  await TenantService.endTenancy(tenancyId, user.id);
  revalidatePath(`/landlord/properties/${propertyId}`);
  revalidatePath(`/landlord/properties/${propertyId}/tenants`);
}

export async function reviewJoinRequestAction(requestId: string, approve: boolean, _state: { error?: string; success?: string }, _form: FormData) {
  try {
    const user = await requireLandlord();
    if (approve && _form.get('confirm') !== 'on') return { error: 'Confirm the tenant and room assignment before approving.' };
    await RoomJoinService.review(requestId, user.id, approve);
    revalidatePath('/landlord', 'layout');
    revalidatePath('/tenant', 'layout');
    return { success: approve ? 'Room assignment approved.' : 'Join request declined.' };
  } catch (error) { return actionError(error); }
}
