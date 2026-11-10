import Link from 'next/link';
import { Newspaper, Plus } from 'lucide-react';
import { requireTenant } from '@/lib/auth/session';
import { AnnouncementService } from '@/services/notifications/announcement.service';
import { TenantService } from '@/services/tenants/tenant.service';

export const metadata = { title: 'Property News' };
export default async function TenantNewsPage() {
  const user = await requireTenant();
  const [posts, tenancy] = await Promise.all([AnnouncementService.getTenantAnnouncements(user.id), TenantService.getActiveTenancy(user.id)]);
  const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' });
  return <main className="mx-auto max-w-3xl p-4 pb-24 md:p-6">
    <header className="mb-6"><p className="text-sm text-muted-foreground">{tenancy?.property.name ?? 'Your property'}</p><h1 className="mt-1 text-2xl font-bold">Property news</h1></header>
    {!posts.length ? <div className="border-y py-10 text-center"><Newspaper size={28} className="mx-auto mb-3 text-primary" /><h2 className="font-semibold">No property updates yet</h2>
      {!tenancy && <Link href="/tenant/join" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white"><Plus size={16} /> Join a room</Link>}
    </div> : <div className="space-y-4">{posts.map(post => <article key={post.id} id={'news-' + post.id} className="card-abangta min-w-0 rounded-3xl p-5">
      <h2 className="break-words font-semibold">{post.title}</h2><p className="mt-1 text-xs text-muted-foreground">{post.createdBy.name} / {date.format(post.createdAt)}</p>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm">{post.message}</p>
    </article>)}</div>}
  </main>;
}
