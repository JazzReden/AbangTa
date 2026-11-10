'use client';

import React, { createContext, useContext, useState } from 'react';
import { AdditionalCharges } from './AdditionalCharges';
import { tenantCharges, type TenantParkingMode } from '@/lib/utils/tenant-parking';
import type { AdditionalCharge } from '@/lib/utils/additional-charges';

type Tenant = { id: string; name: string; roomNumber: string; parkingMode: TenantParkingMode };
const BillingTenantContext = createContext<{
  tenants: Tenant[]; selected: string; select: (id: string) => void; defaults: AdditionalCharge[];
} | null>(null);

export function BillingTenantProvider({ tenants, defaults, children }: { tenants: Tenant[]; defaults: AdditionalCharge[]; children?: React.ReactNode }) {
  const [selected, select] = useState(tenants[0]?.id ?? '');
  return <BillingTenantContext.Provider value={{ tenants, selected, select, defaults }}>{children}</BillingTenantContext.Provider>;
}

function useBillingTenant() {
  const context = useContext(BillingTenantContext);
  if (!context) throw new Error('Billing tenant context is missing');
  return context;
}

export function BillingTenantSelect() {
  const { tenants, selected, select } = useBillingTenant();
  return <select name="tenancyId" required value={selected} onChange={event => select(event.target.value)} className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm">
    {!tenants.length && <option value="">No active tenants</option>}
    {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name} · Room {tenant.roomNumber}</option>)}
  </select>;
}

export function TenantBillCharges() {
  const { tenants, selected, defaults } = useBillingTenant();
  const mode = tenants.find(tenant => tenant.id === selected)?.parkingMode ?? 'NOT_APPLICABLE';
  const charges = tenantCharges(defaults, mode);
  return <AdditionalCharges key={selected + JSON.stringify(charges)} initialCharges={charges} parkingLocked={mode !== 'USE_PROPERTY_RATE'} />;
}
