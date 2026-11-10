'use server';

import { revalidatePath } from 'next/cache';
import { requireLandlord, requireTenant } from '@/lib/auth/session';
import { actionError, optionalString } from '@/lib/actions/form';
import {
  createAnnouncementSchema,
  createMaintenanceSchema,
  updateMaintenanceStatusSchema,
} from '@/lib/validations';
import { AnnouncementService } from '@/services/notifications/announcement.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { MaintenanceService } from '@/services/maintenance/maintenance.service';
import { TenantService } from '@/services/tenants/tenant.service';

export async function createAnnouncementAction(
  propertyId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    const parsed = createAnnouncementSchema.safeParse({
      title: optionalString(formData.get('title')),
      message: optionalString(formData.get('message')),
      expiresAt: optionalString(formData.get('expiresAt')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid announcement' };
    }
    await AnnouncementService.create(propertyId, parsed.data, user.id);
    revalidatePath(`/landlord/properties/${propertyId}/announcements`);
    revalidatePath('/tenant', 'layout');
    return { success: 'Property update published.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function deleteAnnouncementAction(propertyId: string, announcementId: string) {
  const user = await requireLandlord();
  await AnnouncementService.delete(announcementId, user.id);
  revalidatePath(`/landlord/properties/${propertyId}/announcements`);
  revalidatePath('/tenant', 'layout');
}

export async function updateAnnouncementAction(id: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    const parsed = createAnnouncementSchema.safeParse({ title: optionalString(form.get('title')), message: optionalString(form.get('message')), expiresAt: optionalString(form.get('expiresAt')) });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const post = await AnnouncementService.update(id, parsed.data, user.id);
    revalidatePath(`/landlord/properties/${post.propertyId}/announcements`);
    revalidatePath('/tenant', 'layout');
    return { success: 'Property update saved.' };
  } catch (error) { return actionError(error); }
}

export async function archiveAnnouncementAction(id: string, _state: { error?: string; success?: string }, form: FormData) {
  try {
    const user = await requireLandlord();
    if (form.get('confirm') !== 'on') return { error: 'Confirm before archiving this update.' };
    const post = await AnnouncementService.archive(id, user.id);
    revalidatePath(`/landlord/properties/${post.propertyId}/announcements`);
    revalidatePath('/tenant', 'layout');
    return { success: 'Property update archived.' };
  } catch (error) { return actionError(error); }
}

export async function updateMaintenanceStatusAction(
  requestId: string,
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();
    const parsed = updateMaintenanceStatusSchema.safeParse({
      status: formData.get('status'),
      statusNotes: optionalString(formData.get('statusNotes')),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid status update' };
    }
    const updated = await MaintenanceService.updateStatus(
      requestId,
      parsed.data.status,
      parsed.data.statusNotes,
      user.id
    );
    revalidatePath('/landlord/maintenance');
    revalidatePath(`/landlord/properties/${updated.propertyId}/maintenance`);
    return { success: 'Request updated.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function createTenantMaintenanceAction(
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireTenant();
    const tenancy = await TenantService.getActiveTenancy(user.id);
    if (!tenancy) {
      return { error: 'You need an active tenancy before submitting a request.' };
    }
    const parsed = createMaintenanceSchema.safeParse({
      title: optionalString(formData.get('title')),
      description: optionalString(formData.get('description')),
      category: formData.get('category'),
      priority: formData.get('priority'),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid request' };
    }
    await MaintenanceService.createRequest(parsed.data, user.id, tenancy.id);
    revalidatePath('/tenant/maintenance');
    revalidatePath('/tenant/dashboard');
    return { success: 'Maintenance request submitted.' };
  } catch (error) {
    return actionError(error);
  }
}

export async function markNotificationReadAction(notificationId: string) {
  const user = await requireLandlord().catch(async () => requireTenant());
  await NotificationService.markAsRead(notificationId, user.id);
  revalidatePath('/landlord/notifications');
  revalidatePath('/tenant/notifications');
}

export async function markAllNotificationsReadAction() {
  const user = await requireLandlord().catch(async () => requireTenant());
  await NotificationService.markAllAsRead(user.id);
  revalidatePath('/landlord/notifications');
  revalidatePath('/tenant/notifications');
}
