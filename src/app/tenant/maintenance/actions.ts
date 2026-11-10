'use server';

import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/auth/session';
import { actionError, optionalString } from '@/lib/actions/form';
import { createMaintenanceSchema } from '@/lib/validations';
import { MaintenanceService } from '@/services/maintenance/maintenance.service';
import { prisma } from '@/lib/db/prisma';

export type MaintenanceFormState = { error?: string; success?: boolean };

export async function createMaintenanceRequestAction(
  _state: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  try {
    const user = await requireTenant();

    const parsed = createMaintenanceSchema.safeParse({
      title: optionalString(formData.get('title')),
      description: optionalString(formData.get('description')),
      category: formData.get('category'),
      priority: formData.get('priority'),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid request details' };
    }

    // Get active tenancy
    const tenancy = await prisma.tenancy.findFirst({
      where: { tenantId: user.id, status: 'ACTIVE' },
    });

    if (!tenancy) {
      return { error: 'You do not have an active tenancy' };
    }

    await MaintenanceService.createRequest(parsed.data, user.id, tenancy.id);
    revalidatePath('/tenant/maintenance');
    revalidatePath('/landlord', 'layout');
    revalidatePath('/tenant/dashboard');

    return { error: undefined, success: true };
  } catch (err) {
    return actionError(err);
  }
}
