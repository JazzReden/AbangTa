import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tenantCharges } from '@/lib/utils/tenant-parking';
import { BillingTenantProvider, BillingTenantSelect, TenantBillCharges } from '@/components/landlord/TenantBillCharges';
import type { AdditionalCharge } from '@/lib/utils/additional-charges';

const defaults: AdditionalCharge[] = [
  { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 100 },
  { itemType: 'PARKING', description: 'Parking', treatment: 'ADDITIONAL', amount: 250 },
];

test('parking charges are opt-in; free and non-applicable preserve Wi-Fi amounts', () => {
  expect(tenantCharges(defaults, 'USE_PROPERTY_RATE')).toEqual(defaults);
  expect(tenantCharges(defaults, 'NOT_APPLICABLE')).toEqual([defaults[0]]);
  expect(tenantCharges(defaults, 'FREE')).toEqual([defaults[0], { itemType: 'PARKING', description: 'Parking', treatment: 'FREE', amount: 0 }]);
  expect(defaults[1].amount).toBe(250);
});

test('a crafted per-bill parking charge cannot bypass tenant eligibility', () => {
  for (const mode of ['FREE', 'NOT_APPLICABLE'] as const) {
    expect(() => tenantCharges(defaults, mode, true)).toThrow('not assigned paid parking');
  }
  expect(() => tenantCharges(defaults, 'INVALID' as never)).toThrow();
});

test('the selected tenant controls parking prefills and locks non-user parking', () => {
  for (const mode of ['FREE', 'NOT_APPLICABLE', 'USE_PROPERTY_RATE'] as const) {
    const html = renderToStaticMarkup(React.createElement(BillingTenantProvider, {
      tenants: [{ id: 'tenant', name: 'Tenant', roomNumber: '101', parkingMode: mode }], defaults,
    }, React.createElement(React.Fragment, null, React.createElement(BillingTenantSelect), React.createElement(TenantBillCharges))));
    expect(html).toContain('name="tenancyId"');
    expect(html).toContain('value="100"');
    if (mode === 'USE_PROPERTY_RATE') expect(html).toContain('value="250"');
    else {
      expect(html).not.toContain('value="250"');
      expect(html).toContain('aria-label="Parking billing" disabled=""');
    }
  }
});
