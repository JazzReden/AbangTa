import { ArrowUpRight, CheckCircle2, Search } from 'lucide-react';
import { requireLandlord } from '@/lib/auth/session';
import { ActionCenterService } from '@/services/operations/action-center.service';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListPagination } from '@/components/ui/ListControls';
import { listHref, type ListQuery } from '@/lib/lists/query';
import { formatPeso } from '@/lib/utils/currency';

export const metadata = { title: 'Action Center' };
const path = '/landlord/action-center';
const tabs = [
  { value: 'proofs', label: 'Payment reviews' },
  { value: 'overdue', label: 'Overdue bills' },
  { value: 'repairs', label: 'Open repairs' },
] as const;

export default async function ActionCenterPage({ searchParams }: { searchParams: Promise<ListQuery> }) {
  const user = await requireLandlord();
  const raw = await searchParams;
  const [result, summary] = await Promise.all([ActionCenterService.list(user.id, raw), ActionCenterService.summary(user.id)]);
  const { query, records } = result;
  const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <PageHeader eyebrow="Across your properties" title="Action center" description="A clear next step for every payment and repair."
      action={<a href="/landlord/dashboard" className="app-secondary-action">Back to dashboard</a>} />
    <nav aria-label="Action queues" className="mb-5 grid gap-3 sm:grid-cols-3">
      {tabs.map(tab => <a key={tab.value} href={listHref(path, { filter: tab.value, q: query.q })}
        aria-current={query.filter === tab.value ? 'page' : undefined}
        className={`flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-4 font-semibold ${query.filter === tab.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card hover:border-primary/50'}`}>
        <span>{tab.label}</span><span className="rounded-lg bg-card px-2 py-1 tabular-nums">{summary[tab.value]}</span>
      </a>)}
    </nav>
    <form action={path} method="get" role="search" aria-label="Search action center" className="mb-5 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end">
      <input type="hidden" name="filter" value={query.filter} />
      <label className="min-w-0 flex-1 text-sm font-medium">Search property, tenant or room{query.filter === 'repairs' ? ', or repair title' : ''}
        <input key={query.q} type="search" name="q" defaultValue={query.q} maxLength={100} className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-3 py-2" />
      </label>
      {query.filter === 'repairs' && <label className="text-sm font-medium">Priority<select key={query.priority} name="priority" defaultValue={query.priority} className="mt-1 block min-h-12 w-full rounded-xl border bg-background px-3 py-2"><option value="">All priorities</option><option value="URGENT">Urgent only</option></select></label>}
      <button className="app-primary-action" type="submit"><Search size={17} aria-hidden="true" />Search</button>
      {(query.q || query.priority) && <a href={listHref(path, { filter: query.filter })} className="app-secondary-action">Clear filters</a>}
    </form>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p>{result.total} matching {result.total === 1 ? 'item' : 'items'}</p>
      <p>{query.filter === 'repairs' ? 'Highest priority first, then oldest reported' : query.filter === 'overdue' ? 'Oldest due date first' : 'Oldest submission first'}</p>
    </div>
    {query.filter === 'proofs' && <p className="mb-5 rounded-xl bg-primary/5 p-4 text-sm">A submitted proof is not a confirmed payment. Verify the transfer in your own GCash account before approving.</p>}
    {records.length ? <div className="space-y-3">{records.map(item => <article key={item.id} className="card-abangta p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{item.location}</p>
          <h2 className="mt-1 break-words font-semibold">{item.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
          <p className="mt-2 text-xs text-muted-foreground">{item.dateLabel} <time dateTime={item.date.toISOString()}>{date.format(item.date)}</time></p>
          {item.warning && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm font-medium">{item.warning}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:max-w-[16rem] sm:items-end">
          {item.amount !== undefined && <div className="sm:text-right"><p className="text-xs text-muted-foreground">{item.amountLabel}</p><p className="break-words text-xl font-semibold tabular-nums">{formatPeso(item.amount)}</p></div>}
          <a href={item.href} className="app-secondary-action gap-2">{item.action}<ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </div>
    </article>)}</div> : <section className="card-abangta p-8 text-center">
      <CheckCircle2 size={30} className="mx-auto mb-3 text-primary" aria-hidden="true" />
      <h2 className="font-semibold">{query.q || query.priority ? 'No matching items' : 'This queue is clear'}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{query.q || query.priority ? 'Try another search or clear your filters.' : 'New items appear here when they need your attention. Check the other queues for remaining work.'}</p>
    </section>}
    <ListPagination path={path} query={query} result={result} />
  </div>;
}
