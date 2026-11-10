'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, optionalString } from '@/lib/actions/form';
import { updateLandlordProfileSchema } from '@/lib/validations';

export async function updateLandlordProfileAction(
  _state: { error?: string; success?: string },
  formData: FormData
) {
  try {
    const user = await requireLandlord();

    const parsed = updateLandlordProfileSchema.safeParse({
      name: optionalString(formData.get('name')),
      phone: optionalString(formData.get('phone')),
      avatarUrl: optionalString(formData.get('avatarUrl')),
      businessName: optionalString(formData.get('businessName')),
      bio: optionalString(formData.get('bio')),
      officeAddress: optionalString(formData.get('officeAddress')),
      taxIdNumber: optionalString(formData.get('taxIdNumber')),
      gcashName: optionalString(formData.get('gcashName')),
      gcashNumber: optionalString(formData.get('gcashNumber')),
      bankName: optionalString(formData.get('bankName')),
      bankAccountName: optionalString(formData.get('bankAccountName')),
      bankAccountNumber: optionalString(formData.get('bankAccountNumber')),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid profile details' };
    }

    const {
      name,
      phone,
      avatarUrl,
      businessName,
      bio,
      officeAddress,
      taxIdNumber,
      gcashName,
      gcashNumber,
      bankName,
      bankAccountName,
      bankAccountNumber,
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

      await tx.landlordProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          businessName: businessName ?? null,
          bio: bio ?? null,
          officeAddress: officeAddress ?? null,
          taxIdNumber: taxIdNumber ?? null,
          gcashName: gcashName ?? null,
          gcashNumber: gcashNumber ?? null,
          bankName: bankName ?? null,
          bankAccountName: bankAccountName ?? null,
          bankAccountNumber: bankAccountNumber ?? null,
        },
        update: {
          businessName: businessName ?? null,
          bio: bio ?? null,
          officeAddress: officeAddress ?? null,
          taxIdNumber: taxIdNumber ?? null,
          gcashName: gcashName ?? null,
          gcashNumber: gcashNumber ?? null,
          bankName: bankName ?? null,
          bankAccountName: bankAccountName ?? null,
          bankAccountNumber: bankAccountNumber ?? null,
        },
      });
    });

    revalidatePath('/landlord/profile');
    revalidatePath('/landlord/dashboard');
    revalidatePath('/tenant/bills');
    return { success: 'Landlord profile and payment details saved successfully.' };
  } catch (error) {
    return actionError(error);
  }
}
