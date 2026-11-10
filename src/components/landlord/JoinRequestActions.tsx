'use client';

import React, { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check, X, LoaderCircle } from 'lucide-react';

type Result = { error?: string; success?: string };
type ReviewAction = (state: Result, form: FormData) => Promise<Result>;

export function JoinRequestActions({ approve, decline, beds }: { approve: ReviewAction; decline: ReviewAction; beds?: Array<{ id: string; label: string; rent: string }> }) {
  const [state, action] = useActionState(async (previous: Result, form: FormData) => {
    if (form.get('decision') === 'decline') return decline(previous, form);
    if (form.get('decision') !== 'approve' || form.get('confirm') !== 'on') {
      return { error: 'Confirm the tenant and room assignment before approving.' };
    }
    return approve(previous, form);
  }, {});

  return <form action={action} className="mt-4 space-y-3">
    {beds && <label className="block max-w-sm text-sm"><span className="mb-1.5 block font-medium">Bed</span>
      <select name="bedId" required defaultValue="" className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm">
        <option value="" disabled>Choose a bed</option>
        {beds.map(bed => <option key={bed.id} value={bed.id}>{bed.label} / PHP {bed.rent} monthly</option>)}
      </select></label>}
    <ReviewControls />
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    {state.success && <p role="status" className="text-sm text-green-700">{state.success}</p>}
  </form>;
}

function ReviewControls() {
  const { pending } = useFormStatus();
  const buttonClass = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';
  return <fieldset disabled={pending} className="min-w-0 space-y-3">
    <legend className="sr-only">Review room join request</legend>
    <label className="flex items-start gap-2 text-sm text-muted-foreground">
      <input type="checkbox" name="confirm" required className="mt-0.5 h-4 w-4 shrink-0 accent-primary" />
      <span>Confirm tenant and room assignment</span>
    </label>
    <div className="grid grid-cols-2 gap-3 sm:inline-grid sm:grid-cols-[128px_128px]" aria-busy={pending}>
      <button type="submit" name="decision" value="approve" disabled={pending} title="Approve room request" className={buttonClass + ' border border-primary bg-primary text-white'}>
        {pending ? <LoaderCircle size={16} className="shrink-0 animate-spin" /> : <Check size={16} className="shrink-0" />} Approve
      </button>
      <button type="submit" name="decision" value="decline" formNoValidate disabled={pending} title="Decline room request" className={buttonClass + ' border border-input bg-white text-foreground hover:bg-muted'}>
        <X size={16} className="shrink-0" /> Decline
      </button>
    </div>
  </fieldset>;
}
