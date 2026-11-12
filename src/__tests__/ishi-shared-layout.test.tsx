import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LandlordLayout from '@/app/landlord/layout';
import { requireLandlord } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/lib/auth/session', () => ({ requireLandlord: jest.fn() }));
jest.mock('@/lib/db/prisma', () => ({ prisma: { property: { findMany: jest.fn() } } }));
jest.mock('next/navigation', () => ({ redirect: () => { throw new Error('LOGIN_REDIRECT'); } }));
jest.mock('@/components/landlord/LandlordSidebar', () => () => null);
jest.mock('@/components/landlord/LandlordBottomNav', () => () => null);
jest.mock('@/components/SiteFooter', () => ({ SiteFooter: () => null }));
jest.mock('@/components/assistant/LandlordAssistant', () => ({ LandlordAssistant: ({ userId }: { userId: string }) => <div data-assistant-user={userId} /> }));
beforeEach(() => { jest.clearAllMocks(); });

test('the protected shared landlord layout mounts one assistant for all child routes', async () => {
  jest.mocked(requireLandlord).mockResolvedValue({ id: 'owner', role: 'LANDLORD', name: 'Owner', email: '' });
  jest.mocked(prisma.property.findMany).mockResolvedValue([]);
  const html = renderToStaticMarkup(await LandlordLayout({ children: <div>Property bills page</div> }));
  expect(html).toContain('Property bills page'); expect(html.match(/data-assistant-user/g)).toHaveLength(1);
  expect(html).toContain('data-assistant-user="owner"');
  expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { landlordId: 'owner', landlord: { role: 'LANDLORD' }, archivedAt: null } }));
});
test('unauthenticated access never queries assistant property scope', async () => {
  jest.mocked(requireLandlord).mockRejectedValue(new Error('Unauthorized'));
  await expect(LandlordLayout({ children: null })).rejects.toThrow('LOGIN_REDIRECT');
  expect(prisma.property.findMany).not.toHaveBeenCalled();
});
test('dashboard signals refreshes without mounting a second widget; tenant layout has none', () => {
  const dashboard = readFileSync(join(process.cwd(), 'src/app/landlord/dashboard/page.tsx'), 'utf8');
  const tenant = readFileSync(join(process.cwd(), 'src/app/tenant/layout.tsx'), 'utf8');
  const wrapper = readFileSync(join(process.cwd(), 'src/components/assistant/LandlordAssistant.tsx'), 'utf8');
  expect(dashboard).not.toContain('<NadineAssistant'); expect(dashboard).toContain('<AssistantRefreshSignal');
  expect(tenant).not.toContain('LandlordAssistant');
  expect(wrapper).toContain('abangta:ishi-position:v2:${userId}'); expect(wrapper).toContain('usePathname');
});
