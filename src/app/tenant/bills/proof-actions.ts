'use server';

import { revalidatePath } from 'next/cache';
import { requireLandlord, requireTenant } from '@/lib/auth/session';
import { actionError, checkboxField, requiredString } from '@/lib/actions/form';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { PaymentProofService } from '@/services/billing/payment-proof.service';

type State = { error?: string; success?: string };
function refresh() {
  revalidatePath('/tenant', 'layout');
  revalidatePath('/landlord', 'layout');
}

export async function submitGCashProofAction(billId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireTenant();
    const file = form.get('proof');
    if (!(file instanceof File)) return { error: 'Choose a JPG or PNG screenshot.' };
    await PaymentProofService.submit(billId, user.id, {
      amount: requiredString(form.get('amount')), paymentDate: philippineDate(requiredString(form.get('paymentDate'))),
      referenceNumber: requiredString(form.get('referenceNumber')), idempotencyKey: requiredString(form.get('idempotencyKey')), file,
    });
    refresh();
    return { success: 'Proof submitted. Your balance will update only after landlord confirmation.' };
  } catch (error) { return actionError(error); }
}

export async function approveGCashProofAction(proofId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    await PaymentProofService.review(proofId, user.id, 'APPROVE', checkboxField(form.get('received')));
    refresh();
    return { success: 'Payment confirmed. The receipt is available.' };
  } catch (error) { return actionError(error); }
}

export async function rejectGCashProofAction(proofId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    await PaymentProofService.review(proofId, user.id, 'REJECT', false, requiredString(form.get('reason')));
    refresh();
    return { success: 'Proof declined. The tenant has been notified.' };
  } catch (error) { return actionError(error); }
}
