import { notFound } from 'next/navigation';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { randomUUID } from 'node:crypto';
import { requireLandlord } from '@/lib/auth/session';
import { BillingService } from '@/services/billing/billing.service';
import { recordPaymentAction, voidPaymentAction, cancelBillStateAction, sendBillReminderAction, confirmExistingReceiptAction } from '@/app/landlord/billing/actions';
import { Bell } from 'lucide-react';
import { ReceiptDownload } from '@/components/billing/ReceiptDownload';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { BillStatusBadge } from '@/components/ui/StatusBadge';
import { billStatusFromAmounts } from '@/lib/utils/billing';
import { formatPeso } from '@/lib/utils/currency';
import { formatDate, formatDateInput, formatBillingPeriod } from '@/lib/utils/dates';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';
import { applyAdvanceAction } from '@/app/landlord/billing/funds-actions';
import { PaymentProofs } from '@/components/billing/PaymentProofs';
import { prisma } from '@/lib/db/prisma';
import { proofSummarySelect } from '@/services/billing/payment-proof.service';

export default async function BillPage({ params }: { params: Promise<{ propertyId: string; billId: string }> }) {
  const { propertyId, billId } = await params;
  const user = await requireLandlord();
  const bill = await BillingService.getBillDetail(billId, user.id);
  if (!bill || bill.property.id !== propertyId) notFound();
  const balance = BillingService.remaining(bill.totalAmount, bill.amountPaid);
  const funds = await TenantFundsService.getSummary(bill.tenancyId, user.id);
  const proofs = await prisma.paymentProof.findMany({ where: { billId: bill.id }, select: proofSummarySelect, orderBy: { createdAt: 'desc' } });
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-bold">{bill.tenancy.tenant.name}: {formatBillingPeriod(bill.billingPeriodStart)}</h1>
      <PropertyNav propertyId={propertyId} current="bills" />
      <div className="flex flex-wrap gap-3"><BillStatusBadge status={bill.cancelledAt ? 'CANCELLED' : billStatusFromAmounts(bill.totalAmount, bill.amountPaid, bill.dueDate)} /><p>Room {bill.tenancy.room.roomNumber} / Due {formatDate(bill.dueDate)}</p></div>
      <section className="space-y-3 border-y py-4">
        {bill.items.map(item => <div key={item.id} className="flex justify-between gap-4">
          <p className="min-w-0">{item.description}</p>
          <p className="shrink-0 font-semibold">{item.chargeTreatment === 'FREE' ? 'Free' : item.isIncluded ? 'Included in Rent' : formatPeso(item.amount)}</p>
        </div>)}
        <p>Total: {formatPeso(bill.totalAmount)} / Paid: {formatPeso(bill.amountPaid)}</p>
        <p className="text-xl font-bold">Remaining: {formatPeso(balance)}</p>
      </section>
      <section className="space-y-3 border-b pb-4">
        <p className="text-sm">Deposit held: {formatPeso(funds.deposit)} / Unused advance: {formatPeso(funds.advance)}</p>
        <Link href={`/landlord/properties/${propertyId}/tenants/${bill.tenancyId}/funds`} className="inline-flex text-sm text-primary hover:underline">Deposits &amp; advances</Link>
        {!bill.cancelledAt && balance.greaterThan(0) && new Decimal(funds.advance).greaterThan(0) && <StatefulForm action={applyAdvanceAction.bind(null, billId)} className="space-y-3">
          <h2 className="font-semibold">Apply advance credit</h2>
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <Field label="Advance amount to apply" name="amount" type="number" step="0.01" min="0.01" max={Decimal.min(balance, funds.advance).toFixed(2)} defaultValue={Decimal.min(balance, funds.advance).toFixed(2)} required />
          <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required className="mt-1 accent-primary" />Apply previously received advance credit to this bill.</label>
          <SubmitButton className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Apply advance</SubmitButton>
        </StatefulForm>}
      </section>
      {balance.greaterThan(0) && !bill.cancelledAt && <StatefulForm action={sendBillReminderAction.bind(null, propertyId, billId)} className="space-y-2">
        <SubmitButton className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Bell size={16} />Send reminder</SubmitButton>
      </StatefulForm>}
      {balance.greaterThan(0) && !bill.cancelledAt && (
        <StatefulForm action={recordPaymentAction.bind(null, propertyId, billId)} className="space-y-3">
          <h2 className="font-semibold">Record payment</h2>
          <input type="hidden" name="idempotencyKey" value={randomUUID()} />
          <Field label="Amount" name="amount" type="number" step="0.01" min="0.01" max={balance.toFixed(2)} required />
          <Field label="Payment date" name="paymentDate" type="date" defaultValue={formatDateInput(new Date())} max={formatDateInput(new Date())} required />
          <label className="block">Method<select name="paymentMethod" className="block border rounded-lg p-2"><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
          <Field label="Reference (required for GCash)" name="referenceNumber" maxLength={100} />
          <Field label="Notes" name="notes" maxLength={500} />
          <label className="flex gap-2 items-center"><input name="received" type="checkbox" required /> I confirm this payment was received.</label>
          <SubmitButton className="rounded-lg bg-primary p-3 text-white">Confirm payment</SubmitButton>
        </StatefulForm>
      )}
      <PaymentProofs proofs={proofs} landlord canApprove={!bill.cancelledAt && balance.greaterThan(0)} />
      <h2 className="font-semibold">Payment history</h2>
      {!bill.payments.length && <p>No valid payments recorded.</p>}
      {bill.payments.map(payment => <article key={payment.id} className="border rounded-lg p-4 space-y-2">
        <p>{formatPeso(payment.amount)} / {formatDate(payment.paymentDate)} / {payment.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : payment.paymentMethod}</p>
        <p className="text-sm">Reference: {payment.referenceNumber ?? 'None'}</p>
        <ReceiptDownload payment={{ id: payment.id, paymentMethod: payment.paymentMethod, confirmedAt: payment.confirmedAt, voidedAt: payment.voidedAt }} />
        {!payment.confirmedAt && ['CASH', 'GCASH'].includes(payment.paymentMethod) && <StatefulForm action={confirmExistingReceiptAction.bind(null, propertyId, payment.id)} className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input name="confirmed" type="checkbox" required />I confirm this payment was received.</label>
          <SubmitButton className="rounded-lg border px-3 py-2 text-sm">Confirm and issue receipt</SubmitButton>
        </StatefulForm>}
        <details><summary className="cursor-pointer text-sm">Void payment</summary>
          <StatefulForm action={voidPaymentAction.bind(null, propertyId, payment.id)} className="space-y-3 mt-3">
            <Field label="Reason" name="reason" required minLength={3} maxLength={500} />
            <label className="flex gap-2"><input type="checkbox" required /> Confirm reversal</label>
            <SubmitButton className="rounded-lg border p-2">Void payment</SubmitButton>
          </StatefulForm>
        </details>
      </article>)}
      {!bill.payments.length && !bill.cancelledAt && <details>
        <summary className="cursor-pointer text-sm">Cancel bill</summary>
        <StatefulForm action={cancelBillStateAction.bind(null, propertyId, billId)} className="space-y-3 mt-3">
          <label className="flex gap-2"><input type="checkbox" required /> Confirm cancellation</label>
          <SubmitButton className="rounded-lg border p-2">Cancel bill</SubmitButton>
        </StatefulForm>
      </details>}
    </div>
  );
}
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm">{label}<input {...props} className="block w-full rounded-lg border p-2" /></label>;
}
