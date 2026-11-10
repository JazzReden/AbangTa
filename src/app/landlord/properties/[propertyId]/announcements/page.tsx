import { notFound } from 'next/navigation';
import { Newspaper, Send, Save, Archive } from 'lucide-react';
import { requireLandlord } from '@/lib/auth/session';
import { PropertyService } from '@/services/properties/property.service';
import { AnnouncementService } from '@/services/notifications/announcement.service';
import { PropertyNav } from '@/components/landlord/PropertyNav';
import { StatefulForm, SubmitButton } from '@/components/ui/StatefulForm';
import { createAnnouncementAction, updateAnnouncementAction, archiveAnnouncementAction } from '@/app/landlord/communication/actions';

export const metadata = { title: 'Property News' };
const inputClass = 'mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm';
const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' });
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });

function Fields({ post }: { post?: { title: string; message: string; expiresAt: Date | null } }) {
  return <>
    <label className="block text-sm font-medium">Title<input name="title" required minLength={3} maxLength={200} defaultValue={post?.title} className={inputClass} /></label>
    <label className="block text-sm font-medium">Update<textarea name="message" required minLength={10} maxLength={5000} rows={5} defaultValue={post?.message} className={inputClass + ' resize-y'} /></label>
    <label className="block text-sm font-medium">Visible until (optional)<input type="date" name="expiresAt" defaultValue={post?.expiresAt ? calendar.format(post.expiresAt) : ''} min={calendar.format(new Date())} className={inputClass} /></label>
  </>;
}
export default async function PropertyNewsPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;
  const user = await requireLandlord();
  const property = await PropertyService.getPropertyDetail(propertyId, user.id);
  if (!property) notFound();
  const posts = await AnnouncementService.getPropertyAnnouncements(propertyId, user.id);
  return <div className="mx-auto max-w-6xl p-4 md:p-6">
    <h1 className="mb-2 text-2xl font-bold">{property.name}</h1>
    <PropertyNav propertyId={propertyId} current="announcements" />
    <h2 className="mb-5 text-lg font-semibold">Property news</h2>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-4">
        {!posts.length && <div className="border-y py-10 text-center"><Newspaper size={28} className="mx-auto mb-3 text-primary" /><h3 className="font-semibold">No updates yet</h3></div>}
        {posts.map(post => { const expired = Boolean(post.expiresAt && post.expiresAt <= new Date()); return <article key={post.id} id={'news-' + post.id} className="card-abangta min-w-0 rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{post.title}</h3><span className={'text-xs font-medium ' + (expired ? 'text-muted-foreground' : 'text-primary')}>{expired ? 'Archived / expired' : 'Published'}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{post.createdBy.name} / {date.format(post.createdAt)}{post.expiresAt && !expired ? ' / Until ' + date.format(post.expiresAt) : ''}</p>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm">{post.message}</p>
          <details className="mt-4 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Edit update</summary>
            <StatefulForm action={updateAnnouncementAction.bind(null, post.id)} className="mt-4 space-y-4"><Fields post={post} /><SubmitButton className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Save size={16} /> Save update</SubmitButton></StatefulForm>
          </details>
          {!expired && <StatefulForm action={archiveAnnouncementAction.bind(null, post.id)} className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3">
            <label className="flex items-start gap-2 text-sm text-muted-foreground"><input name="confirm" type="checkbox" required className="mt-0.5 accent-primary" /> Archive this update</label>
            <SubmitButton className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-3 text-sm"><Archive size={16} /> Archive</SubmitButton>
          </StatefulForm>}
        </article>; })}
      </section>
      <aside className="min-w-0 border-t pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><h3 className="mb-4 font-semibold">Post an update</h3>
        <StatefulForm action={createAnnouncementAction.bind(null, propertyId)} className="space-y-4"><Fields /><SubmitButton className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"><Send size={16} /> Publish update</SubmitButton></StatefulForm>
      </aside>
    </div>
  </div>;
}
