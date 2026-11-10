'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ReceiptText, Plus, Wrench, UserRound, Newspaper } from 'lucide-react';
const items = [
  { href: '/tenant/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tenant/bills', label: 'Bills', icon: ReceiptText },
  { href: '/tenant/news', label: 'News', icon: Newspaper },
  { href: '/tenant/join', label: 'Join room', icon: Plus },
  { href: '/tenant/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/tenant/profile', label: 'Profile', icon: UserRound },
];
export function TenantNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={mobile ? 'Mobile tenant navigation' : 'Tenant navigation'}
    className={mobile ? 'fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 gap-0.5 border-t bg-white px-1 pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden' : 'hidden items-center gap-1 lg:flex'}>
    {items.map(item => <Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
      className={(mobile ? 'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] ' : 'inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs ') +
        (pathname.startsWith(item.href) ? 'rounded-xl bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:text-foreground')}>
      <item.icon size={mobile ? 20 : 16} /><span>{mobile ? ({ Dashboard: 'Home', Maintenance: 'Repairs', 'Join room': 'Join' }[item.label] ?? item.label) : item.label}</span>
    </Link>)}
  </nav>;
}
