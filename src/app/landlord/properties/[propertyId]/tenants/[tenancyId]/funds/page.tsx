import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { requireLandlord } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';
import { FundsLedger } from '@/components/billing/FundsLedger';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { recordFundsAction, setDepositTargetAction } from '@/app/landlord/billing/funds-actions';
import { fundLabels } from '@/lib/utils/tenant-funds';
import { formatDateInput } from '@/lib/utils/dates';

export const metadata = { title: 'Deposits & Advances' };
export default async function TenantFundsPage({ params }: { params: Promise<{ propertyId: string; tenancyId: string }> }) {
  const { propertyId, tenancyId } = await params;
  const user = await requireLandlord();
  const tenancy = await prisma.tenancy.findFirst({ where: { id: tenancyId, propertyId, property: { landlordId: user.id } }, select: { status: true, tenant: { select: { name: true } }, property: { select: { archivedAt: true } } } });
  if (!tenancy) notFound();
  const summary = await TenantFundsService.getSummary(tenancyId, user.id);
  const today = formatDateInput(new Date());
  return <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
    <h1 className="text-2xl font-bold">{tenancy.tenant.name}: Deposits &amp; advances</h1>
    <PropertyNav propertyId={propertyId} current="tenants" />
    <Link href={`/landlord/properties/${propertyId}/tenants`} className="inline-flex text-sm text-primary hover:underline">Back to tenants</Link>
    <p className="text-sm text-muted-foreground">{summary.propertyName} / Room {summary.roomNumber}{summary.bedLabel ? ' / ' + summary.bedLabel : ''}</p>
    <FundsLedger summary={summary} landlord />
    {tenancy.status === 'ACTIVE' && !tenancy.property.archivedAt && <details className="border-t pt-4"><summary className="cursor-pointer text-sm text-primary">Agreed deposit</summary>
      <StatefulForm action={setDepositTargetAction.bind(null, tenancyId)} className="mt-3 space-y-3">
        <Field label="Agreed deposit amount" name="amount" type="number" min="0" max="99999999.99" step="0.01" defaultValue={summary.expectedDeposit ?? ''} />
        <SubmitButton className="rounded-lg border px-3 py-2 text-sm">Save agreed deposit</SubmitButton>
      </StatefulForm>
    </details>}
    <StatefulForm action={recordFundsAction.bind(null, tenancyId)} className="space-y-3 border-t pt-4">
      <h2 className="font-semibold">Record deposit or advance</h2>
      <input type="hidden" name="idempotencyKey" value={randomUUID()} />
      <label className="block text-sm">Transaction<select name="kind" className="mt-1 block w-full rounded-lg border bg-background p-2">
        {Object.entries(fundLabels).filter(([kind]) => !kind.endsWith('RECEIVED') || (tenancy.status === 'ACTIVE' && !tenancy.property.archivedAt)).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
      </select></label>
      <Field label="Amount" name="amount" type="number" min="0.01" max="99999999.99" step="0.01" required />
      <Field label="Transaction date" name="paymentDate" type="date" defaultValue={today} max={today} required />
      <label className="block text-sm">Method (receipts and refunds)<select name="paymentMethod" className="mt-1 block w-full rounded-lg border bg-background p-2"><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></label>
      <Field label="Reference (required for GCash receipts/refunds)" name="referenceNumber" maxLength={100} />
      <Field label="Reason / notes (required for deductions)" name="notes" maxLength={500} />
      <label className="flex items-start gap-2 text-sm"><input name="confirmed" type="checkbox" required className="mt-1 accent-primary" />I confirm this transaction and amount.</label>
      <SubmitButton className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Record transaction</SubmitButton>
    </StatefulForm>
  </div>;
}
function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm">{label}<input {...props} className="mt-1 block w-full rounded-lg border bg-background p-2" /></label>;
}
