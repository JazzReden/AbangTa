'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  ListChecks,
  LayoutDashboard,
  Building2,
  Bell,
  User,
  LogOut,
  Building,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionUser } from '@/types';

const navItems = [
  { href: '/landlord/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/landlord/action-center', icon: ListChecks, label: 'Actions' },
  { href: '/landlord/properties', icon: Building2, label: 'Properties' },
  { href: '/landlord/notifications', icon: Bell, label: 'Notifications' },
  { href: '/landlord/profile', icon: User, label: 'Profile' },
];

export default function LandlordSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-dvh w-64 bg-white border-r border-border/50 flex-col z-50">
      {/* Logo */}
      <div className="shrink-0 p-5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="bg-primary rounded-xl p-2">
            <Building className="text-primary-foreground" size={20} />
          </div>
          <div>
            <p className="font-bold text-foreground leading-none">AbangTa</p>
            <p className="text-xs text-muted-foreground leading-none mt-0.5">Landlord</p>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="shrink-0 p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-semibold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="min-h-0 flex-1 overflow-y-auto p-3 space-y-0.5" aria-label="Sidebar navigation">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition',
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="shrink-0 p-3 border-t border-border/50">
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          className="flex min-h-12 items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition w-full"
        >
          <LogOut size={17} className="shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
