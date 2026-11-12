import Link from 'next/link';
import { requireTenant } from '@/lib/auth/session';
import { PaymentService } from '@/services/billing/payment.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatBillingPeriod, formatDateMed } from '@/lib/utils/dates';
import { ReceiptDownload } from '@/components/billing/ReceiptDownload';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';
import { FundsLedger } from '@/components/billing/FundsLedger';
import { PageHeader } from '@/components/ui/PageHeader';
import { prisma } from '@/lib/db/prisma';

export const metadata = { title: 'Payment History' };

export default async function PaymentsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireTenant();
  const query = await searchParams;
  const requestedPage = typeof query.page === 'string' && /^\d+$/.test(query.page) ? Number(query.page) : 1;
  const [history, tenancies] = await Promise.all([
    PaymentService.getTenantPayments(user.id, requestedPage),
    prisma.tenancy.findMany({ where: { tenantId: user.id, OR: [{ status: 'ACTIVE' }, { fundEntries: { some: {} } }, { payments: { some: { paymentMethod: 'ADVANCE' } } }] }, select: { id: true }, orderBy: { startDate: 'desc' } }),
  ]);
  const funds = await Promise.all(tenancies.map(tenancy => TenantFundsService.getSummary(tenancy.id, user.id)));

  return <main className="mx-auto max-w-3xl p-4 pb-28 md:p-6">
    <PageHeader eyebrow="Billing" title="Payment history" description="Recorded payments and corrections. GCash proof appears here after landlord confirmation."
      action={<Link href="/tenant/bills" className="app-secondary-action">View bills</Link>} />
    {history.total === 0 ? <div className="card-abangta rounded-3xl p-6">
      <h2 className="font-semibold">No payments recorded yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">View your bills for payment instructions and submitted GCash proof.</p>
      <Link href="/tenant/bills" className="app-secondary-action mt-4">View payment instructions</Link>
    </div> : <section aria-label="Recorded payments" className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Showing {(history.page - 1) * history.pageSize + 1}–{Math.min(history.page * history.pageSize, history.total)} of {history.total} records
      </p>
      {history.payments.map(payment => <article key={payment.id} className="card-abangta rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xl font-semibold tabular-nums">{formatPeso(payment.amount)}</p>
            <p className="text-sm text-muted-foreground">{payment.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : payment.paymentMethod.replaceAll('_', ' ')}</p>
          </div>
          <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
            {payment.voidedAt ? 'Reversed' : payment.confirmedAt ? 'Confirmed' : 'Recorded — awaiting confirmation'}
          </span>
        </div>
        <p className="mt-3 break-words text-sm font-medium">{payment.bill.property.name} · {formatBillingPeriod(payment.bill.billingPeriodStart)}</p>
        <p className="mt-1 text-sm text-muted-foreground">Payment date: {formatDateMed(payment.paymentDate)}</p>
        {payment.voidedAt ? <div className="mt-3 rounded-xl border border-border p-3 text-sm">
          <p className="font-medium">Reversed on {formatDateMed(payment.voidedAt)}</p>
          <p className="mt-1 break-words">{payment.voidReason || 'Contact your landlord for details.'}</p>
          <p className="mt-1 text-muted-foreground">This record no longer reduces your bill. A reversal does not transfer or refund money.</p>
        </div> : <div className="mt-3"><ReceiptDownload payment={payment} /></div>}
      </article>)}
      {history.pages > 1 && <nav aria-label="Payment history pages" className="flex flex-wrap items-center justify-between gap-3 pt-3">
        {history.page > 1 && <a href={`/tenant/payments?page=${history.page - 1}`} className="app-secondary-action">Previous payments</a>}
        <p className="text-sm text-muted-foreground">Page {history.page} of {history.pages}</p>
        {history.page < history.pages && <a href={`/tenant/payments?page=${history.page + 1}`} className="app-secondary-action">Next payments</a>}
      </nav>}
    </section>}
    {funds.map((summary, index) => <section key={tenancies[index].id} className="mt-6 space-y-4 border-t pt-5">
      <h2 className="font-semibold">Deposits &amp; advances / {summary.propertyName}</h2>
      <p className="text-sm text-muted-foreground">Room {summary.roomNumber}{summary.bedLabel ? ' / ' + summary.bedLabel : ''}</p>
      <FundsLedger summary={summary} />
    </section>)}
  </main>;
}
