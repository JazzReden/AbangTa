'use client';

import { usePathname } from 'next/navigation';
import { NadineAssistant } from './NadineAssistant';

export function TenantAssistant({ userId }: { userId: string }) {
  const pathname = usePathname();
  return <NadineAssistant audience="tenant" properties={[]} contextKey={pathname} positionKey={`abangta:ishi-position:tenant:v2:${userId}`} />;
}
