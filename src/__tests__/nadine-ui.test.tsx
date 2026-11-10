import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NadineAssistant } from '@/components/assistant/NadineAssistant';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('../components/assistant/NadineAssistant.module.css', () => ({ launcher: 'launcher', motion: 'motion', sprite: 'sprite' }));

test('Nadine uses the supplied mascot and a compact side launcher above mobile navigation', () => {
  const html = renderToStaticMarkup(<NadineAssistant properties={[]} contextKey="test" />);
  expect(html).toContain('Open Ishi'); expect(html).not.toContain('Open Nadine');
  expect(html).toContain('aria-expanded="false"'); expect(html).toContain('right-3');
  expect(html).toContain('safe-area-inset-bottom');
  expect(html).toContain('h-20 w-14'); expect(html).toContain('pointer-events-none');
  expect(html).not.toContain('object-cover'); expect(html).not.toContain('rounded-full border');
  expect(html).not.toContain('role="dialog"'); expect(html).not.toContain('OPENAI');
  expect(html).not.toContain('Pause Ishi animation'); expect(html).not.toContain('Play Ishi animation');
  expect(html).toContain('data-paused="false"');
  expect(html).toContain('z-[60]');
});

test('Ishi is portalled above the sidebar and never hidden by collision fallback', () => {
  const component = readFileSync(join(process.cwd(), 'src/components/assistant/NadineAssistant.tsx'), 'utf8');
  const hook = readFileSync(join(process.cwd(), 'src/components/assistant/useNadinePosition.ts'), 'utf8');
  expect(component).toContain('createPortal(content, document.body)');
  expect(hook).not.toContain("visibility: hidden");
  expect(hook).toContain('dockPosition(target, g.size, g.viewport, g.obstacles)');
});

test('Nadine uses occasional full-body waves and an accessible static alternative', () => {
  const css = readFileSync(join(process.cwd(), 'src/components/assistant/NadineAssistant.module.css'), 'utf8');
  expect(css).toContain('/assistant/nadine-wave.png');
  expect(css).toContain('18s step-end infinite'); expect(css).not.toContain('@keyframes nadine-hop');
  expect(css).toContain('prefers-reduced-motion: reduce'); expect(css).toContain('animation: none');
  expect(css).toContain("[data-paused='true']"); expect(css).toContain('animation-play-state: paused');
  expect(css).toContain('max-height: 500px');
});

test('tenant launcher uses the same mascot and avoids the landlord sidebar offset', () => {
  const html = renderToStaticMarkup(<NadineAssistant audience="tenant" properties={[]} contextKey="/tenant/bills" positionKey="tenant-test" />);
  expect(html).toContain('Open Ishi'); expect(html).not.toContain('lg:left-[17rem]');
  expect(html).not.toContain('Reminder deliveries'); expect(html).not.toContain('Property scope');
  const wrapper = readFileSync(join(process.cwd(), 'src/components/assistant/TenantAssistant.tsx'), 'utf8');
  expect(wrapper).toContain('abangta:ishi-position:tenant:v1:${userId}');
  const layout = readFileSync(join(process.cwd(), 'src/app/tenant/layout.tsx'), 'utf8'); expect(layout).toContain('<TenantAssistant');
});
