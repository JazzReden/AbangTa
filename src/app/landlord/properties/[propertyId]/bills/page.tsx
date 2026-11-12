import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ListQuery } from '@/lib/lists/query';
import { requireLandlord } from '@/lib/auth/session';
import { BillListService } from '@/services/billing/bill-list.service';
import { ListControls, ListPagination, BILL_FILTERS } from '@/components/ui/ListControls';
import { PropertyService } from '@/services/properties/property.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatBillingPeriod } from '@/lib/utils/dates';
import { billStatusFromAmounts, remainingBalance } from '@/lib/utils/billing';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { BillStatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReceiptText } from 'lucide-react';

export const metadata = { title: 'Bills' };

export default async function PropertyBillsPage({ params: paramsPromise, searchParams: searchParamsPromise }: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<ListQuery>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const user = await requireLandlord();
  const property = await PropertyService.getOwnedSummary(params.propertyId, user.id);
  if (!property) notFound();
  const result = await BillListService.forProperty(property.id, user.id, searchParams);
  const bills = result.records;
  const path = `/landlord/properties/${property.id}/bills`;

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
      <ListControls path={path} query={result.query} statuses={BILL_FILTERS} searchLabel="Search tenant, room or property" months />
      <p className="mb-4 text-sm text-muted-foreground">{result.total} matching {result.total === 1 ? 'record' : 'records'}</p>
      {bills.length === 0 ? (
        <EmptyState
          icon={<ReceiptText size={34} />}
          title="No matching bills"
          description="Try a different search or clear the filters. You can generate a bill for an active tenant."
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
                  <BillStatusBadge status={billStatusFromAmounts(bill.totalAmount, bill.amountPaid, bill.dueDate)} />
                </div>
                <p className="text-2xl font-bold">{formatPeso(remaining.toString())}</p>
                <p className="text-xs text-muted-foreground">Remaining of {formatPeso(bill.totalAmount)}</p>
                {bill.paymentProofs.length > 0 && <p className="mt-2 text-sm font-medium text-primary">GCash proof awaiting verification</p>}
              </Link>
            );
          })}
        </div>
      )}
      <ListPagination path={path} query={result.query} result={result} />
    </div>
  );
}
