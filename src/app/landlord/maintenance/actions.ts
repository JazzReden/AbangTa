'use server';

import { revalidatePath } from 'next/cache';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, optionalString } from '@/lib/actions/form';
import { updateMaintenanceStatusSchema } from '@/lib/validations';
import { MaintenanceService } from '@/services/maintenance/maintenance.service';

export async function updateMaintenanceAction(requestId: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    const parsed = updateMaintenanceStatusSchema.safeParse({ status: form.get('status'), statusNotes: optionalString(form.get('statusNotes')) });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const request = await MaintenanceService.updateStatus(requestId, parsed.data.status, parsed.data.statusNotes, user.id);
    revalidatePath(`/landlord/properties/${request.propertyId}/maintenance`);
    revalidatePath('/landlord/dashboard');
    revalidatePath('/landlord/notifications');
    revalidatePath('/tenant/maintenance');
    revalidatePath('/tenant/dashboard');
    return { success: 'Maintenance request updated.' };
  } catch (error) { return actionError(error); }
}
