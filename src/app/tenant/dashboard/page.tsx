import { PageHeader } from '@/components/ui/PageHeader';
import Link from 'next/link';
import { Bell, Building2, CalendarDays, DoorOpen, ReceiptText, Wrench } from 'lucide-react';
import { requireTenant } from '@/lib/auth/session';
import { TenantService } from '@/services/tenants/tenant.service';
import { formatPeso } from '@/lib/utils/currency';
import { remainingBalance } from '@/lib/utils/billing';
import { BillStatusBadge, MaintenanceStatusBadge } from '@/components/ui/StatusBadge';
import { UnassignedTenantHome } from '@/components/tenant/UnassignedTenantHome';
import { ReminderService } from '@/services/billing/reminder.service';

export const metadata = { title: 'Tenant Dashboard' };

export default async function TenantDashboardPage() {
  const user = await requireTenant();
  const dashboard = await TenantService.getTenantDashboard(user.id);
  const reminders = await ReminderService.forTenant(user.id);

  if (!dashboard) {
    return <UnassignedTenantHome userId={user.id} name={user.name} />;
  }

  const { property, room, tenancy, currentBill, recentPayments, maintenanceRequests, announcements } =
    dashboard;
  const balance = currentBill
    ? remainingBalance(currentBill.totalAmount, currentBill.amountPaid)
    : 0;

  return (
    <main className="mx-auto max-w-5xl p-4 pb-28 md:p-6">
      <PageHeader eyebrow="Welcome home" title={user.name} description={`${property.name} · Room ${room.roomNumber}`} />

      {reminders.length > 0 && <section className="mb-5 space-y-3 border-y border-border py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Bell size={17} className="text-primary" />Bill reminders</h2>
        {reminders.map(reminder => <div key={reminder.id}><p className="text-sm font-medium">{reminder.title}</p><p className="mt-1 text-sm text-muted-foreground">{reminder.message}</p></div>)}
        <Link href="/tenant/bills" className="inline-flex text-sm font-medium text-primary hover:underline">View unpaid bills</Link>
      </section>}
      <section className="mb-5 rounded-3xl bg-foreground p-5 text-background shadow-sm">
        <p className="text-xs font-semibold uppercase text-background/70">Total due</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-4xl font-bold">{formatPeso(dashboard.outstandingBalance)}</p>
            {dashboard.earliestUnpaidDueDate || currentBill ? (
              <p className="mt-1 text-sm text-background/70">
                Due {formatDate(dashboard.earliestUnpaidDueDate ?? currentBill!.dueDate)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-background/70">No bill generated yet</p>
            )}
          </div>
          {(currentBill || dashboard.outstandingBalance > 0) && <BillStatusBadge status={dashboard.outstandingStatus} />}
        </div>
      </section>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <InfoCard icon={<Building2 />} label="Property" value={property.name} detail={property.address} />
        <InfoCard icon={<DoorOpen />} label="Room" value={room.roomNumber} detail={tenancy.bed ? tenancy.bed.label : `${room.capacity} capacity`} />
        <InfoCard icon={<CalendarDays />} label="Rent" value={formatPeso(tenancy.monthlyRent)} detail="monthly" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-5">
          <div className="card-abangta rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <ReceiptText size={17} className="text-primary" />
              <h2 className="font-semibold">Current statement</h2>
            </div>
            {currentBill ? (
              <div className="space-y-3">
                {currentBill.items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{prettyItem(item.itemType)}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <p className="text-right font-semibold">
                      {item.chargeTreatment === 'FREE' ? 'Free' : item.isIncluded ? 'Included in Rent' : formatPeso(item.amount)}
                    </p>
                  </div>
                ))}
                <div className="border-t border-border/70 pt-3">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Amount paid</span>
                    <span>{formatPeso(currentBill.amountPaid)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-lg font-bold">
                    <span>Remaining balance</span>
                    <span>{formatPeso(balance)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No monthly bill yet.
              </p>
            )}
          </div>

          <div className="card-abangta rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Wrench size={17} className="text-primary" />
              <h2 className="font-semibold">Maintenance</h2>
            </div>
            {maintenanceRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests submitted.</p>
            ) : (
              <div className="space-y-3">
                {maintenanceRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{request.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {request.category} · {formatDate(request.createdAt)}
                        </p>
                      </div>
                      <MaintenanceStatusBadge status={request.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="card-abangta rounded-3xl p-5">
            <h2 className="mb-4 font-semibold">Recent payments</h2>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{formatPeso(payment.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.paymentMethod === 'ADVANCE' ? 'Advance credit applied' : payment.paymentMethod.replace('_', ' ')} · {formatDate(payment.paymentDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card-abangta rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <Bell size={17} className="text-primary" />
              <h2 className="font-semibold">Property news</h2>
              <Link href="/tenant/news" className="ml-auto text-sm font-medium text-primary">View all</Link>
            </div>
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No property updates yet.</p>
            ) : (
              <div className="space-y-3">
                {announcements.map((announcement) => (
                  <article key={announcement.id} className="rounded-2xl bg-background p-3">
                    <p className="font-medium">{announcement.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{announcement.message}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="sticky-bottom-bar !bottom-16 md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Total due</p>
            <p className="text-lg font-bold">{formatPeso(dashboard.outstandingBalance)}</p>
          </div>
          <Link
            href="/tenant/bills"
            className="rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            View Statement
          </Link>
        </div>
      </div>
    </main>
  );
}

function InfoCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactElement;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="card-abangta rounded-3xl p-5">
      <div className="mb-3 inline-flex rounded-2xl bg-primary/10 p-2 text-primary">
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function prettyItem(itemType: string) {
  if (itemType === 'RENT') return 'Room Rent';
  if (itemType === 'WIFI') return 'Wi-Fi';
  if (itemType === 'PARKING') return 'Parking';
  if (itemType === 'WATER') return 'Water';
  if (itemType === 'ELECTRICITY') return 'Electricity';
  return 'Other';
}
