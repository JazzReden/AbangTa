import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { BillStatus } from '@prisma/client';
import { requireLandlord } from '@/lib/auth/session';
import { BillingService } from '@/services/billing/billing.service';
import { PropertyService } from '@/services/properties/property.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatBillingPeriod } from '@/lib/utils/dates';
import { remainingBalance } from '@/lib/utils/billing';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { FilterChips } from '@/components/ui/FilterChips';
import { BillStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReceiptText } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';

export const metadata = { title: 'Bills' };

export default async function PropertyBillsPage({ params: paramsPromise, searchParams: searchParamsPromise }: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ status?: BillStatus }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(params.propertyId, user.id);
  if (!property) notFound();
  const bills = await BillingService.getPropertyBills(property.id, user.id, searchParams.status);
  const pendingProofs = await prisma.paymentProof.findMany({ where: { status: 'PENDING', bill: { propertyId: property.id } }, select: { billId: true } });

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{property.name}</h1>
        <Link
          href={`/landlord/properties/${property.id}/bills/new`}
          className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Generate bill
        </Link>
      </div>
      <PropertyNav propertyId={property.id} current="bills" />
      <div className="mb-5">
        <FilterChips
          items={[
            { href: `/landlord/properties/${property.id}/bills`, label: 'All', active: !searchParams.status },
            { href: `/landlord/properties/${property.id}/bills?status=PENDING`, label: 'Unpaid', active: searchParams.status === 'PENDING' },
            { href: `/landlord/properties/${property.id}/bills?status=PARTIALLY_PAID`, label: 'Partial', active: searchParams.status === 'PARTIALLY_PAID' },
            { href: `/landlord/properties/${property.id}/bills?status=PAID`, label: 'Paid', active: searchParams.status === 'PAID' },
            { href: `/landlord/properties/${property.id}/bills?status=OVERDUE`, label: 'Overdue', active: searchParams.status === 'OVERDUE' },
          ]}
        />
      </div>
      {bills.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={34} />}
          title="No bills yet"
          description="Create a monthly bill for an active tenant."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {bills.map((bill) => {
            const remaining = remainingBalance(bill.totalAmount.toString(), bill.amountPaid.toString());
            return (
              <Link
                key={bill.id}
                href={`/landlord/properties/${property.id}/bills/${bill.id}`}
                className="card-abangta block rounded-3xl p-5"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      {formatBillingPeriod(bill.billingPeriodStart)}
                    </p>
                    <h2 className="font-semibold">{bill.tenancy.tenant.name}</h2>
                    <p className="text-sm text-muted-foreground">Room {bill.tenancy.room.roomNumber}</p>
                  </div>
                  <BillStatusBadge status={bill.status} />
                </div>
                <p className="text-2xl font-bold">{formatPeso(remaining.toString())}</p>
                <p className="text-xs text-muted-foreground">Remaining of {formatPeso(bill.totalAmount)}</p>
                {pendingProofs.some(proof => proof.billId === bill.id) && <p className="mt-2 text-sm font-medium text-primary">GCash proof awaiting verification</p>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
