'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireTenant } from '@/lib/auth/session';
import { actionError, optionalString } from '@/lib/actions/form';
import { updateTenantProfileSchema } from '@/lib/validations';

export async function updateTenantProfileAction(
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireTenant();

    const parsed = updateTenantProfileSchema.safeParse({
      name: optionalString(formData.get('name')),
      phone: optionalString(formData.get('phone')),
      avatarUrl: optionalString(formData.get('avatarUrl')),
      occupation: optionalString(formData.get('occupation')),
      companyOrSchool: optionalString(formData.get('companyOrSchool')),
      permanentAddress: optionalString(formData.get('permanentAddress')),
      governmentIdType: optionalString(formData.get('governmentIdType')),
      governmentIdNum: optionalString(formData.get('governmentIdNum')),
      emergencyContact: optionalString(formData.get('emergencyContact')),
      emergencyPhone: optionalString(formData.get('emergencyPhone')),
      notes: optionalString(formData.get('notes')),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid profile details' };
    }

    const {
      name,
      phone,
      avatarUrl,
      occupation,
      companyOrSchool,
      permanentAddress,
      governmentIdType,
      governmentIdNum,
      emergencyContact,
      emergencyPhone,
      notes,
    } = parsed.data;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name,
          phone: phone ?? null,
          avatarUrl: avatarUrl ?? null,
        },
      });

      await tx.tenantProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          occupation: occupation ?? null,
          companyOrSchool: companyOrSchool ?? null,
          permanentAddress: permanentAddress ?? null,
          governmentIdType: governmentIdType ?? null,
          governmentIdNum: governmentIdNum ?? null,
          emergencyContact: emergencyContact ?? null,
          emergencyPhone: emergencyPhone ?? null,
          notes: notes ?? null,
        },
        update: {
          occupation: occupation ?? null,
          companyOrSchool: companyOrSchool ?? null,
          permanentAddress: permanentAddress ?? null,
          governmentIdType: governmentIdType ?? null,
          governmentIdNum: governmentIdNum ?? null,
          emergencyContact: emergencyContact ?? null,
          emergencyPhone: emergencyPhone ?? null,
          notes: notes ?? null,
        },
      });
    });

    revalidatePath('/tenant/profile');
    revalidatePath('/tenant/dashboard');
    return { success: 'Profile and verification details updated successfully.' };
  } catch (error) {
    return actionError(error);
  }
}
