import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2, LogOut } from 'lucide-react';
import { requireTenant } from '@/lib/auth/session';
import { signOut } from '@/lib/auth';
import { TenantNavigation } from '@/components/tenant/TenantNavigation';
import { TenantAssistant } from '@/components/assistant/TenantAssistant';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTenant().catch(() => null);
  if (!user) redirect('/auth/login?role=TENANT');
  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/auth/login' });
  }
  return <div className="app-shell flex min-h-dvh flex-col bg-background">
      <a href="#workspace-content" className="app-skip-link">Skip to content</a>
    <header className="sticky top-0 z-30 shrink-0 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/tenant/dashboard" className="flex shrink-0 items-center gap-2">
          <div className="rounded-xl bg-primary p-2 text-white"><Building2 size={20} /></div>
          <div><p className="font-bold leading-none">AbangTa</p><p className="mt-1 text-xs text-muted-foreground">Tenant</p></div>
        </Link>
        <TenantNavigation />
        <form action={signOutAction}><button aria-label="Sign out" title="Sign out" className="flex h-11 w-11 items-center justify-center rounded-xl border bg-white text-muted-foreground"><LogOut size={17} /></button></form>
      </div>
    </header>
    <div className="flex flex-1 flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0"><div id="workspace-content" tabIndex={-1} className="flex-1">{children}</div></div>
    <TenantNavigation mobile />
    <TenantAssistant key={user.id} userId={user.id} />
  </div>;
}
