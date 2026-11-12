import type { ListQuery } from '@/lib/lists/query';
import { listHref } from '@/lib/lists/query';

type Option = { value: string; label: string };
export function ListControls({ path, query, statuses, searchLabel, months = false, priorities = false }: {
  path: string; query: { q: string; status: string; month: string; priority: string };
  statuses: Option[]; searchLabel: string; months?: boolean; priorities?: boolean;
}) {
  const field = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-base';
  return <form action={path} method="get" role="search" aria-label="Filter records" className="card-abangta mb-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-2">
    <label className="min-w-0 text-sm font-medium">{searchLabel}<input name="q" type="search" maxLength={100} defaultValue={query.q} className={field} /></label>
    <label className="text-sm font-medium">Status<select name="status" defaultValue={query.status} className={field}><option value="">All statuses</option>{statuses.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    {months && <label className="min-w-0 text-sm font-medium">Billing month<input name="month" type="month" defaultValue={query.month} className={field} /></label>}
    {priorities && <label className="text-sm font-medium">Priority<select name="priority" defaultValue={query.priority} className={field}><option value="">All priorities</option>{['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(value => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}</select></label>}
    <div className="flex flex-wrap items-end gap-3"><button type="submit" className="app-secondary-action">Apply filters</button><a href={path} className="inline-flex min-h-11 items-center px-2 text-sm underline">Clear filters</a></div>
  </form>;
}
export function ListPagination({ path, query, result }: { path: string; query: Omit<ListQuery, 'page'>; result: { total: number; page: number; pages: number; pageSize: number } }) {
  return <nav aria-label="Record pages" className="my-5 flex flex-wrap items-center justify-between gap-3">
    <p className="text-sm text-muted-foreground">{result.total ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}` : '0 records'} · Page {result.page} of {result.pages}</p>
    <div className="flex flex-wrap gap-3">
      {result.page > 1 && <a className="app-secondary-action" href={listHref(path, query, result.page - 1)}>Previous records</a>}
      {result.page < result.pages && <a className="app-secondary-action" href={listHref(path, query, result.page + 1)}>Next records</a>}
    </div>
  </nav>;
}
export const BILL_FILTERS = [{ value: 'PENDING', label: 'Unpaid' }, { value: 'PARTIALLY_PAID', label: 'Partially paid' }, { value: 'PAID', label: 'Paid' }, { value: 'OVERDUE', label: 'Overdue' }];
export const MAINTENANCE_FILTERS = [{ value: 'OPEN', label: 'Open requests' }, { value: 'SUBMITTED', label: 'Submitted' }, { value: 'ACKNOWLEDGED', label: 'Acknowledged' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }];
