import { requireTenant } from '@/lib/auth/session';
import { PaymentService } from '@/services/billing/payment.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatDateMed } from '@/lib/utils/dates';
import { ReceiptDownload } from '@/components/billing/ReceiptDownload';
import { TenantFundsService } from '@/services/billing/tenant-funds.service';
import { FundsLedger } from '@/components/billing/FundsLedger';
import { prisma } from '@/lib/db/prisma';
export const metadata = { title: 'Payment History' };
export default async function PaymentsPage() {
  const user = await requireTenant();
  const payments = await PaymentService.getTenantPayments(user.id);
  const tenancies = await prisma.tenancy.findMany({ where: { tenantId: user.id, OR: [{ status: 'ACTIVE' }, { fundEntries: { some: {} } }, { payments: { some: { paymentMethod: 'ADVANCE' } } }] }, select: { id: true }, orderBy: { startDate: 'desc' } });
  const funds = await Promise.all(tenancies.map(tenancy => TenantFundsService.getSummary(tenancy.id, user.id)));
  return <main className="mx-auto max-w-3xl p-4 pb-28 md:p-6">
    <h1 className="mb-6 text-2xl font-bold">Payment history</h1>
    {!payments.length && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
    {payments.map(payment => <article key={payment.id} className="mb-3 flex flex-wrap justify-between gap-3 rounded-xl border bg-white p-4">
      <div><p className="font-semibold">{formatPeso(payment.amount)}</p><p className="text-sm text-muted-foreground">{payment.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : payment.paymentMethod.replaceAll('_', ' ')}</p></div>
      <p className="text-sm text-muted-foreground">{formatDateMed(payment.paymentDate)}</p>
      <ReceiptDownload payment={{ id: payment.id, paymentMethod: payment.paymentMethod, confirmedAt: payment.confirmedAt, voidedAt: payment.voidedAt }} />
    </article>)}
    {funds.map((summary, index) => <section key={tenancies[index].id} className="mt-6 space-y-4 border-t pt-5">
      <h2 className="font-semibold">Deposits &amp; advances / {summary.propertyName}</h2>
      <p className="text-sm text-muted-foreground">Room {summary.roomNumber}{summary.bedLabel ? ' / ' + summary.bedLabel : ''}</p>
      <FundsLedger summary={summary} />
    </section>)}
  </main>;
}
