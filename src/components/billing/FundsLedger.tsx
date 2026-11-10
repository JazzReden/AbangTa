import Link from 'next/link';
import { formatPeso } from '@/lib/utils/currency';
import { formatDateMed, formatBillingPeriod } from '@/lib/utils/dates';
import { fundLabels } from '@/lib/utils/tenant-funds';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { voidFundsAction } from '@/app/landlord/billing/funds-actions';
import type { TenantFundsService } from '@/services/billing/tenant-funds.service';

export type FundsSummary = Awaited<ReturnType<typeof TenantFundsService.getSummary>>;
export function FundsLedger({ summary, landlord = false }: { summary: FundsSummary; landlord?: boolean }) {
  return <section className="space-y-4">
    <dl className="grid gap-3 sm:grid-cols-3">
      <div><dt className="text-sm text-muted-foreground">Agreed deposit</dt><dd className="font-semibold">{summary.expectedDeposit === null ? 'Not set' : formatPeso(summary.expectedDeposit)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Deposit held</dt><dd className="font-semibold">{formatPeso(summary.deposit)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Unused advance</dt><dd className="font-semibold">{formatPeso(summary.advance)}</dd></div>
    </dl>
    <h2 className="font-semibold">Deposit &amp; advance history</h2>
    {!summary.entries.length && <p className="text-sm text-muted-foreground">No deposit or advance transactions recorded.</p>}
    {summary.entries.map(entry => <article key={entry.id} className="space-y-2 rounded-lg border p-4">
      <p className="font-semibold">{fundLabels[entry.kind]} / {formatPeso(entry.amount)}{entry.voidedAt ? ' / Voided' : ''}</p>
      <p className="text-sm text-muted-foreground">{formatDateMed(entry.paymentDate)}{entry.paymentMethod ? ' / ' + entry.paymentMethod.replaceAll('_', ' ') : ''}</p>
      {entry.referenceNumber && <p className="break-all text-sm">Reference: {entry.referenceNumber}</p>}
      {entry.notes && <p className="whitespace-pre-wrap break-words text-sm">{entry.notes}</p>}
      {entry.voidedAt && <p className="break-words text-sm text-muted-foreground">Reversed: {entry.voidReason}</p>}
      {landlord && !entry.voidedAt && <details><summary className="cursor-pointer text-sm text-primary">Void ledger entry</summary>
        <StatefulForm action={voidFundsAction.bind(null, entry.id)} className="mt-3 space-y-3">
          <label className="block text-sm">Reason<input name="reason" required minLength={3} maxLength={500} className="mt-1 block w-full rounded-lg border bg-background p-2" /></label>
          <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required className="mt-1 accent-primary" />Confirm reversal</label>
          <SubmitButton className="rounded-lg border px-3 py-2 text-sm">Void entry</SubmitButton>
        </StatefulForm></details>}
    </article>)}
    {summary.entries.length === 50 && <p className="text-xs text-muted-foreground">Latest 50 ledger entries. Balances include the complete ledger.</p>}
    {summary.applications.length > 0 && <><h2 className="font-semibold">Advance applications</h2>
      {summary.applications.map(payment => <div key={payment.id} className="border-t py-3 text-sm">
        <p>{formatPeso(payment.amount)} / {formatBillingPeriod(payment.bill.billingPeriodStart)}{payment.voidedAt ? ' / Reversed' : ''}</p>
        {payment.voidedAt && <p className="break-words text-muted-foreground">{payment.voidReason}</p>}
        <Link className="text-primary hover:underline" href={landlord ? `/landlord/properties/${payment.bill.propertyId}/bills/${payment.bill.id}` : '/tenant/bills'}>View bill</Link>
      </div>)}
      {summary.applications.length === 50 && <p className="text-xs text-muted-foreground">Latest 50 applications. Balances include all applications.</p>}
    </>}
  </section>;
}
