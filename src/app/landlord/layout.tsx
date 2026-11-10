import Link from 'next/link';
import { Building2 } from 'lucide-react';
import React from 'react';
import { redirect } from 'next/navigation';
import { requireLandlord } from '@/lib/auth/session';
import LandlordSidebar from '@/components/landlord/LandlordSidebar';
import LandlordBottomNav from '@/components/landlord/LandlordBottomNav';
import { LandlordAssistant } from '@/components/assistant/LandlordAssistant';
import { prisma } from '@/lib/db/prisma';

export default async function LandlordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireLandlord().catch(() => null);
  if (!user) redirect('/auth/login');
  const properties = await prisma.property.findMany({ where: { landlordId: user.id, landlord: { role: 'LANDLORD' }, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 });

  return (
    <div className="app-shell min-h-screen bg-background">
      {/* Desktop sidebar */}
      <LandlordSidebar user={user} />

      <header className="app-mobile-header lg:hidden">
        <Link href="/landlord/dashboard" className="flex items-center gap-2 font-bold">
          <span className="rounded-xl bg-primary p-2 text-white"><Building2 size={20} /></span>AbangTa
        </Link>
        <Link href="/landlord/profile" className="app-account-link" aria-label="Open your landlord profile">Landlord<span aria-hidden="true">{user.name.charAt(0).toUpperCase()}</span></Link>
      </header>

      {/* Main content */}
      <main className="lg:ml-64 flex min-h-dvh flex-col pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="flex-1">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <LandlordBottomNav />
      <LandlordAssistant key={user.id} userId={user.id} properties={properties} />
    </div>
  );
}
