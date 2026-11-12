'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ListChecks, LayoutDashboard, Building2, Bell, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/landlord/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/landlord/action-center', icon: ListChecks, label: 'Actions' },
  { href: '/landlord/properties', icon: Building2, label: 'Properties' },
  { href: '/landlord/notifications', icon: Bell, label: 'Alerts' },
  { href: '/landlord/profile', icon: User, label: 'Profile' },
];

export default function LandlordBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-border/50 pb-[env(safe-area-inset-bottom)] lg:hidden z-50"
      aria-label="Mobile navigation"
    >
      <div className="grid grid-cols-5 gap-1 px-2 py-2">
        {navItems.map((item) => {
          const isActive =
            item.href === '/landlord/dashboard'
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 px-1 py-1.5 rounded-xl transition',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon size={22} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
