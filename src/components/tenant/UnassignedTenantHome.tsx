import Link from 'next/link';
import { Building2, Plus, ReceiptText, Wallet, Wrench, UserRound, Bell, Clock3 } from 'lucide-react';
import { TenantHomeService } from '@/services/tenants/tenant-home.service';
import { formatPeso } from '@/lib/utils/currency';
import { formatDateMed } from '@/lib/utils/dates';

export async function UnassignedTenantHome({ userId, name }: { userId: string; name: string }) {
  const summary = await TenantHomeService.getSummary(userId);
  const actions = [
    { href: '/tenant/bills', icon: ReceiptText, label: 'My bills' },
    { href: '/tenant/payments', icon: Wallet, label: 'Payment history' },
    { href: '/tenant/maintenance', icon: Wrench, label: 'Maintenance' },
    { href: '/tenant/profile', icon: UserRound, label: 'My profile' },
  ];
  return <main className="mx-auto max-w-5xl p-4 pb-28 md:p-6">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">Tenant dashboard</p><h1 className="mt-1 text-2xl font-bold">Welcome, {name}</h1></div>
      <Link href="/tenant/join" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><Plus size={18} /> Join a room</Link>
    </header>
    <section className="border-y border-border py-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 size={25} /></div>
        <div><h2 className="text-lg font-semibold">Your room</h2><p className="mt-1 text-sm text-muted-foreground">Not joined yet</p></div>
      </div>
      <dl className="mt-6 grid gap-5 sm:grid-cols-3">
        <div><dt className="text-xs font-medium text-muted-foreground">Room status</dt><dd className="mt-1 font-semibold">Awaiting assignment</dd></div>
        <div><dt className="text-xs font-medium text-muted-foreground">Outstanding bills</dt><dd className="mt-1 font-semibold">{summary.billCount ? formatPeso(summary.balance) : 'No bills yet'}</dd></div>
        <div><dt className="text-xs font-medium text-muted-foreground">Account</dt><dd className="mt-1 font-semibold">Tenant</dd></div>
      </dl>
    </section>
    <nav aria-label="Tenant actions" className="grid grid-cols-2 gap-3 py-6 sm:grid-cols-4">
      {actions.map(action => <Link key={action.href} href={action.href} className="flex min-h-16 items-center gap-3 rounded-xl border bg-white px-3 py-4 text-sm font-medium transition hover:border-primary/40">
        <action.icon size={20} className="shrink-0 text-primary" /><span>{action.label}</span>
      </Link>)}
    </nav>
    {summary.joins.length > 0 && <section className="mb-6 border-b pb-6">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Clock3 size={18} className="text-primary" /> Room join requests</h2>
      <div className="space-y-3">{summary.joins.map(request => {
        const status = request.status === 'PENDING' && request.expiresAt && request.expiresAt <= new Date() ? 'Invitation expired' :
          request.status === 'PENDING' ? 'Awaiting landlord approval' : request.status === 'APPROVED' ? 'Approved' : 'Declined';
        return <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
          <div><p className="font-medium">{request.propertyName}</p><p className="text-sm text-muted-foreground">Room {request.roomNumber}</p></div>
          <p className="text-sm text-muted-foreground">{status}</p>
        </div>;
      })}</div>
    </section>}
    <div className="grid gap-6 md:grid-cols-2">
      <section><h2 className="mb-3 flex items-center gap-2 font-semibold"><Wallet size={18} className="text-primary" /> Recent payments</h2>
        {!summary.payments.length ? <p className="text-sm text-muted-foreground">No payments recorded.</p> : summary.payments.map(payment =>
          <div key={payment.id} className="flex justify-between gap-3 border-b py-3 text-sm"><span>{formatPeso(payment.amount)}</span><span className="text-muted-foreground">{formatDateMed(payment.paymentDate)}</span></div>)}
      </section>
      <section><h2 className="mb-3 flex items-center gap-2 font-semibold"><Bell size={18} className="text-primary" /> Notifications</h2>
        {!summary.notifications.length ? <p className="text-sm text-muted-foreground">No notifications yet.</p> : summary.notifications.map(notification =>
          <div key={notification.id} className="border-b py-3"><p className="text-sm font-medium">{notification.title}</p><p className="mt-1 text-sm text-muted-foreground">{notification.message}</p></div>)}
      </section>
    </div>
  </main>;
}
