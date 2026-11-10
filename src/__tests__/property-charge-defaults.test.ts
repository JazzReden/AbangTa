import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Decimal from 'decimal.js';
import { propertyChargesSchema, propertyChargeDefaults } from '@/lib/utils/additional-charges';
import { AdditionalCharges } from '@/components/landlord/AdditionalCharges';

test('property defaults accept only valid Wi-Fi and parking charges', () => {
  const wifi = { itemType: 'WIFI', description: 'Wi-Fi', treatment: 'ADDITIONAL', amount: 100.25 };
  expect(propertyChargesSchema.safeParse([wifi]).success).toBe(true);
  expect(propertyChargesSchema.safeParse([]).success).toBe(true);
  for (const input of [[wifi, wifi], [{ ...wifi, itemType: 'OTHER', description: 'Laundry' }], [{ ...wifi, treatment: 'FREE' }], [{ ...wifi, amount: 0.001 }]]) {
    expect(propertyChargesSchema.safeParse(input).success).toBe(false);
  }
});

test('stored decimals serialize safely and prefill the existing bill controls', () => {
  const initialCharges = propertyChargeDefaults([
    { itemType: 'WIFI', treatment: 'ADDITIONAL', amount: new Decimal('100.25') },
    { itemType: 'PARKING', treatment: 'FREE', amount: new Decimal(0) },
  ]);
  const html = renderToStaticMarkup(React.createElement(AdditionalCharges, { initialCharges }));
  expect(html).toContain('value="100.25"');
  expect(html).toContain('value="FREE" selected=""');
  expect(html).toContain('Add charge');
  const defaults = renderToStaticMarkup(React.createElement(AdditionalCharges, { initialCharges, allowCustom: false, legend: 'Monthly defaults (per tenant)' }));
  expect(defaults).toContain('Monthly defaults (per tenant)');
  expect(defaults).not.toContain('Add charge');
});
