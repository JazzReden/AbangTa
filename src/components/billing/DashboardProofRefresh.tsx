'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { startDashboardProofRefresh } from '@/lib/billing/dashboard-proof-refresh';

export function DashboardProofRefresh({ revision, page }: { revision: string; page: number }) {
  const router = useRouter();
  useEffect(() => startDashboardProofRefresh({ revision, page, refresh: () => router.refresh() }), [revision, page, router]);
  return null;
}
