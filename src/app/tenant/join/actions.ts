'use server';
import { requireTenant } from '@/lib/auth/session';
import { RoomJoinService } from '@/services/tenants/room-join.service';
import { actionError } from '@/lib/actions/form';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { revalidatePath } from 'next/cache';

export async function previewRoomInvitation(input: string) {
  try {
    const user = await requireTenant();
    return { preview: await RoomJoinService.preview(input, user.id) };
  } catch (error) { return actionError(error); }
}
export async function confirmRoomInvitation(input: string) {
  try {
    const user = await requireTenant();
    if (!(await checkRateLimit('room-join:' + user.id, { limit: 10, windowMs: 60000 })).allowed) return { error: 'Too many attempts. Please wait a minute.' };
    const result = await RoomJoinService.confirm(input, user.id);
    revalidatePath('/tenant', 'layout');
    revalidatePath('/landlord', 'layout');
    return result;
  } catch (error) { return actionError(error); }
}
