import { ReceiptText } from 'lucide-react';
import Link from 'next/link';
import { ReceiptDownload } from '@/components/billing/ReceiptDownload';
import { requireTenant } from '@/lib/auth/session';
import { BillingService } from '@/services/billing/billing.service';
import { formatPeso } from '@/lib/utils/currency';
import { remainingBalance, billStatusFromAmounts } from '@/lib/utils/billing';
import { BillStatusBadge } from '@/components/ui/StatusBadge';
import { GCashProofForm, PaymentProofs } from '@/components/billing/PaymentProofs';
import { prisma } from '@/lib/db/prisma';
import { proofSummarySelect } from '@/services/billing/payment-proof.service';

export const metadata = { title: 'My Bills' };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatPeriod(start: Date, _end: Date) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' }).format(start);
}

function prettyItem(itemType: string) {
  if (itemType === 'RENT') return 'Room Rent';
  if (itemType === 'WIFI') return 'Wi-Fi';
  if (itemType === 'PARKING') return 'Parking';
  if (itemType === 'WATER') return '💧 Water';
  if (itemType === 'ELECTRICITY') return '⚡ Electricity';
  return 'Other';
}

export default async function TenantBillsPage() {
  const user = await requireTenant();

  const bills = await BillingService.getTenantBills(user.id);
  const proofs = await prisma.paymentProof.findMany({ where: { bill: { tenancy: { tenantId: user.id } } }, select: { ...proofSummarySelect, billId: true }, orderBy: { createdAt: 'desc' } });

  return (
    <main className="mx-auto max-w-3xl p-4 pb-24 md:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Billing</p>
        <h1 className="text-2xl font-bold">My Bills</h1>
        <Link href="/tenant/payments" className="mt-2 inline-flex text-sm font-medium text-primary hover:underline">Payment history &amp; balances</Link>
      </div>

      {bills.length === 0 ? (
        <div className="card-abangta rounded-3xl p-8 text-center">
          <ReceiptText size={36} className="mx-auto mb-3 text-muted-foreground" />
          <h2 className="font-semibold">No bills yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your landlord hasn&apos;t generated a bill yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {bills.map((bill) => {
            const remaining = remainingBalance(bill.totalAmount, bill.amountPaid);
            const billProofs = proofs.filter(proof => proof.billId === bill.id);
            return (
              <article
                key={bill.id}
                className="card-abangta rounded-3xl p-5"
              >
                {/* Header */}
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {formatPeriod(bill.billingPeriodStart, bill.billingPeriodEnd)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Due {formatDate(bill.dueDate)}
                    </p>
                    {remaining.greaterThan(0) && bill.dueDate.getTime() <= Date.now() + 3 * 86400000 && <p className="mt-1 text-xs font-medium text-primary">Payment reminder: {formatPeso(remaining)} unpaid.</p>}
                  </div>
                  <BillStatusBadge status={billStatusFromAmounts(bill.totalAmount, bill.amountPaid, bill.dueDate)} />
                </div>

                {/* Bill items */}
                <div className="space-y-2.5 mb-4">
                  {bill.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium">{prettyItem(item.itemType)}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <p className="text-sm font-semibold text-right whitespace-nowrap">
                        {item.chargeTreatment === 'FREE' ? 'Free' : item.isIncluded ? (
                          <span className="text-muted-foreground font-normal">Included in Rent</span>
                        ) : (
                          formatPeso(item.amount)
                        )}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="rounded-2xl bg-background p-4 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Total billed</span>
                    <span className="font-medium">{formatPeso(bill.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Amount paid</span>
                    <span className="font-medium text-green-600">{formatPeso(bill.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-border/50 pt-2 mt-2">
                    <span>Remaining balance</span>
                    <span className={remaining.greaterThan(0) ? 'text-destructive' : 'text-green-600'}>
                      {formatPeso(remaining)}
                    </span>
                  </div>
                </div>

                {remaining.greaterThan(0) && <section className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  <h3 className="font-semibold">Payment options</h3>
                  <p>Cash: pay your landlord and request a receipt.</p>
                  {bill.property.landlord.landlordProfile?.gcashName && bill.property.landlord.landlordProfile?.gcashNumber && <div>
                    <p className="font-medium">GCash: {bill.property.landlord.landlordProfile.gcashName}</p>
                    <p>{bill.property.landlord.landlordProfile.gcashNumber}</p>
                    <p className="text-xs text-muted-foreground">Confirm the recipient in GCash before sending. Keep your transaction reference and send it to your landlord.</p>
                  </div>}
                  <p className="text-xs text-muted-foreground">Payments appear after your landlord confirms receipt.</p>
                </section>}
                <PaymentProofs proofs={billProofs} />
                {remaining.greaterThan(0) && !billProofs.some(proof => proof.status === 'PENDING') && <GCashProofForm billId={bill.id} balance={remaining.toFixed(2)} />}
                {/* Payment history */}
                {bill.payments.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Payments
                    </p>
                    <div className="space-y-2">
                      {bill.payments.map((payment) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <div>
                            <span className="font-medium">{formatPeso(payment.amount)}</span>
                            <span className="text-muted-foreground ml-1">
                              · {payment.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : payment.paymentMethod.replace('_', ' ')}
                            </span>
                            <div className="mt-1"><ReceiptDownload payment={{ id: payment.id, paymentMethod: payment.paymentMethod, confirmedAt: payment.confirmedAt, voidedAt: payment.voidedAt }} /></div>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {formatDate(payment.paymentDate)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
