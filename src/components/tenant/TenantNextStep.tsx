import React from 'react';
import { ArrowRight, CheckCircle2, Clock3, ReceiptText } from 'lucide-react';
import type { TenantNextStep as NextStep } from '@/lib/billing/tenant-next-step';

export function TenantNextStep({ step }: { step: NextStep | null }) {
  const pending = step?.status === 'AWAITING_REVIEW';
  const rejected = step?.status === 'PROOF_REJECTED';
  const title = pending ? 'Your proof is with your landlord' : rejected ? 'Your payment proof needs attention' : step ? 'Your next step: review this bill' : 'No unpaid bills right now';
  const description = pending ? 'Confirmation is still pending. Check your submitted proof and wait for your landlord’s review before paying this bill again.'
    : rejected ? 'Read your landlord’s reason, check the transaction details, and submit a corrected proof if needed.'
    : step ? 'Open the statement for payment details. If you have already sent GCash, submit your proof for your landlord to verify.'
    : 'New statements will appear when your landlord issues them. You can still review your payment history or report a repair.';
  const Icon = pending ? Clock3 : step ? ReceiptText : CheckCircle2;
  return <section aria-labelledby="tenant-next-step" className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
    <div className="flex items-start gap-3"><Icon size={22} className="mt-1 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0">
      <h2 id="tenant-next-step" className="font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <a href={step ? `/tenant/bills?bill=${encodeURIComponent(step.billId)}` : '/tenant/payments'} className="app-secondary-action gap-2">{pending ? 'View submitted proof' : rejected ? 'Review correction' : step ? 'Open bill' : 'Payment history'}<ArrowRight size={16} aria-hidden="true" /></a>
        <a href="/tenant/maintenance" className="inline-flex min-h-12 items-center px-2 text-sm font-medium underline">Report a repair</a>
      </div>
    </div></div>
  </section>;
}
