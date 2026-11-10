'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NadineAssistant } from './NadineAssistant';

const refreshEvent = 'abangta:assistant-records-changed';

export function AssistantRefreshSignal({ revision }: { revision: string }) {
  useEffect(() => { window.dispatchEvent(new Event(refreshEvent)); }, [revision]);
  return null;
}

export function LandlordAssistant({ userId, properties }: { userId: string; properties: Array<{ id: string; name: string }> }) {
  const pathname = usePathname();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(refreshEvent, refresh);
    return () => window.removeEventListener(refreshEvent, refresh);
  }, []);
  return <NadineAssistant properties={properties} contextKey={`${pathname}:${revision}`} positionKey={`abangta:ishi-position:v1:${userId}`} />;
}
