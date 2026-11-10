import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { submitGCashProofAction, approveGCashProofAction, rejectGCashProofAction } from '@/app/tenant/bills/proof-actions';
import { formatDate, formatDateInput } from '@/lib/utils/dates';
import { formatPeso } from '@/lib/utils/currency';
import type { proofSummarySelect } from '@/services/billing/payment-proof.service';
import { ProofImageInput } from './ProofImageInput';
import { MAX_PROOF_BYTES } from '@/lib/security/payment-proof-image';

type Proof = Prisma.PaymentProofGetPayload<{ select: typeof proofSummarySelect }>;
const button = 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50';
const field = 'block w-full rounded-lg border bg-background p-2';

export function GCashProofForm({ billId, balance }: { billId: string; balance: string }) {
  return <details className="mt-4 border-t border-border pt-4 text-sm">
    <summary className="cursor-pointer font-medium text-primary">Submit GCash proof</summary>
    <StatefulForm action={submitGCashProofAction.bind(null, billId)} className="mt-3 space-y-3">
      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
      <label className="block">Amount sent<input className={field} name="amount" type="number" min="0.01" max={balance} step="0.01" required /></label>
      <label className="block">Payment date<input className={field} name="paymentDate" type="date" max={formatDateInput(new Date())} defaultValue={formatDateInput(new Date())} required /></label>
      <label className="block">GCash reference number<input className={field} name="referenceNumber" minLength={4} maxLength={100} required /></label>
      <ProofImageInput maxBytes={MAX_PROOF_BYTES} className={field + ' min-w-0 text-sm'} />
      <p className="text-xs text-muted-foreground">Awaiting verification does not mean paid. Your landlord must confirm the funds arrived before a receipt is issued.</p>
      <SubmitButton className={button}>Submit proof</SubmitButton>
    </StatefulForm>
  </details>;
}

export function PaymentProofs({ proofs, landlord = false, canApprove = true }: { proofs: Proof[]; landlord?: boolean; canApprove?: boolean }) {
  if (!proofs.length) return null;
  return <section className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
    <h2 className="font-semibold">GCash payment proofs</h2>
    {proofs.map(proof => <div key={proof.id} id={'proof-' + proof.id} className="space-y-2 border-b border-border pb-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{formatPeso(proof.amount)} / {formatDate(proof.paymentDate)}</p>
        <p className="font-medium">{proof.payment?.voidedAt ? 'Payment reversed' : proof.status === 'PENDING' ? 'Awaiting verification' : proof.status === 'APPROVED' ? 'Confirmed' : 'Declined'}</p>
      </div>
      <p className="break-all text-muted-foreground">Reference: {proof.referenceNumber}</p>
      <a href={`/api/payment-proofs/${proof.id}/image`} target="_blank" rel="noopener noreferrer" className="inline-flex font-medium text-primary hover:underline">View screenshot</a>
      {proof.rejectionReason && <p className="break-words">Reason: {proof.rejectionReason}</p>}
      {landlord && proof.status === 'PENDING' && <div className="space-y-3">
        {canApprove ? <StatefulForm action={approveGCashProofAction.bind(null, proof.id)} className="space-y-3">
          <label className="flex items-start gap-2"><input name="received" type="checkbox" required className="mt-1 accent-primary" />I verified the amount, recipient and reference in my GCash account and received this payment.</label>
          <SubmitButton className={button}>Confirm GCash payment</SubmitButton>
        </StatefulForm> : <p className="text-muted-foreground">This bill has no payable balance. Check existing payments and decline duplicate proof.</p>}
        <details><summary className="cursor-pointer text-muted-foreground">Decline proof</summary>
          <StatefulForm action={rejectGCashProofAction.bind(null, proof.id)} className="mt-3 space-y-3">
            <label className="block">Reason<textarea className={field} name="reason" required minLength={3} maxLength={500} rows={2} /></label>
            <SubmitButton className="rounded-lg border px-4 py-2 text-sm">Decline proof</SubmitButton>
          </StatefulForm>
        </details>
      </div>}
    </div>)}
  </section>;
}
