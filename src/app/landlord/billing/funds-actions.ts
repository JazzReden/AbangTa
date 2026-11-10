'use server';
import { revalidatePath } from 'next/cache';
import { requireLandlord } from '@/lib/auth/session';
import { actionError, checkboxField, numericField, optionalString } from '@/lib/actions/form';
import { philippineDate } from '@/lib/utils/philippine-dates';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';
import { fundEntrySchema } from '@/lib/utils/tenant-funds';

type State = { error?: string; success?: string };
function refreshFunds() { revalidatePath('/landlord', 'layout'); revalidatePath('/tenant', 'layout'); }

export async function recordFundsAction(tenancyId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    if (!checkboxField(form.get('confirmed'))) return { error: 'Confirm the transaction before recording it.' };
    const kind = form.get('kind');
    const referenceNumber = optionalString(form.get('referenceNumber'));
    const input = fundEntrySchema.parse({ kind, amount: Number(form.get('amount')), paymentDate: philippineDate(String(form.get('paymentDate') ?? '')),
      paymentMethod: kind === 'DEPOSIT_DEDUCTED' ? null : form.get('paymentMethod'), referenceNumber,
      notes: optionalString(form.get('notes')), idempotencyKey: form.get('idempotencyKey') });
    await TenantFundsService.record(tenancyId, user.id, input);
    refreshFunds(); return { success: 'Ledger entry recorded. Monthly bill totals are unchanged.' };
  } catch (error) { return actionError(error); }
}

export async function voidFundsAction(entryId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    if (!checkboxField(form.get('confirmed'))) return { error: 'Confirm the reversal first.' };
    await TenantFundsService.voidEntry(entryId, user.id, String(form.get('reason') ?? ''));
    refreshFunds(); return { success: 'Entry voided. The original record is retained.' };
  } catch (error) { return actionError(error); }
}

export async function applyAdvanceAction(billId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    if (!checkboxField(form.get('confirmed'))) return { error: 'Confirm applying existing advance credit first.' };
    await TenantFundsService.applyAdvance(billId, user.id, Number(form.get('amount')), String(form.get('idempotencyKey') ?? ''));
    refreshFunds(); return { success: 'Advance applied to this bill. No new cash payment was recorded.' };
  } catch (error) { return actionError(error); }
}

export async function setDepositTargetAction(tenancyId: string, _state: State, form: FormData): Promise<State> {
  try {
    const user = await requireLandlord();
    await TenantFundsService.setDepositTarget(tenancyId, user.id, numericField(form.get('amount')));
    refreshFunds(); return { success: 'Agreed deposit updated. No payment was recorded.' };
  } catch (error) { return actionError(error); }
}
