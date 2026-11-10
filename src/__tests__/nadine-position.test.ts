import { clampPosition, dockPosition, overlaps, safePosition } from '@/lib/assistant/position';
import { parsePosition, savePosition, restorePosition } from '@/lib/assistant/position-preference';

const mobile = { width: 390, height: 844 }, size = { width: 128, height: 128 };
test('saved positions round-trip on the same screen and scale safely to mobile', () => {
  const desktop = { width: 1440, height: 1000 }, point = { x: 1000, y: 700 };
  const saved = parsePosition(JSON.stringify(savePosition(point, size, desktop)));
  expect(saved).not.toBeNull();
  const restored = restorePosition(saved!, size, desktop);
  expect(restored.x).toBeCloseTo(point.x); expect(restored.y).toBeCloseTo(point.y);
  const small = restorePosition(saved!, size, mobile);
  expect(small.x).toBeGreaterThanOrEqual(12); expect(small.x + size.width).toBeLessThanOrEqual(378);
  expect(small.y + size.height).toBeLessThanOrEqual(832);
});
test.each([null, '', 'broken', '{}', 'null', '{"version":2,"x":0.5,"y":0.5}', '{"version":1,"x":-1,"y":0}', '{"version":1,"x":"0.5","y":0}', '{"version":1,"x":0,"y":999}', 'x'.repeat(300)])('invalid stored coordinates are ignored: %s', raw => {
  expect(parsePosition(raw)).toBeNull();
});
test('drag positions stay within viewport edges and account for visual viewport offsets', () => {
  expect(clampPosition({ x: -500, y: 900 }, size, mobile)).toEqual({ x: 12, y: 704 });
  expect(clampPosition({ x: 999, y: -5 }, size, { ...mobile, top: 200 })).toEqual({ x: 250, y: 212 });
});
test('dropping over mobile navigation snaps to nearby free space', () => {
  const nav = { x: 0, y: 776, width: 390, height: 68 };
  const p = safePosition({ x: 20, y: 750 }, size, mobile, [nav]);
  expect(p).not.toBeNull(); expect(overlaps({ ...p!, ...size }, nav)).toBe(false);
  expect(p!.y + size.height).toBeLessThanOrEqual(768);
});
test('desktop sidebars and actionable controls are not covered', () => {
  const blocks = [{ x: 0, y: 0, width: 256, height: 1000 }, { x: 300, y: 600, width: 200, height: 50 }];
  const p = safePosition({ x: 320, y: 580 }, size, { width: 1440, height: 1000 }, blocks);
  expect(p).not.toBeNull(); expect(blocks.some(b => overlaps({ ...p!, ...size }, b))).toBe(false);
});
test('dense screens never use a blocked fallback; tiny screens are handled safely', () => {
  expect(safePosition({ x: 0, y: 0 }, size, mobile, [{ x: 0, y: 0, ...mobile }])).toBeNull();
  expect(safePosition({ x: 0, y: 0 }, size, { width: 100, height: 100 }, [])).toBeNull();
});
test('a safe position remains stable and resize rechecks bounds', () => {
  const p = { x: 100, y: 400 };
  expect(safePosition(p, size, mobile, [])).toEqual(p);
  expect(safePosition(p, { width: 80, height: 64 }, { width: 390, height: 400 }, [])?.y).toBe(324);
});

test('compact assistant docks to either side and avoids bottom navigation', () => {
  const compact = { width: 56, height: 80 };
  const nav = { x: 0, y: 760, width: 390, height: 84 };
  const right = dockPosition({ x: 220, y: 780 }, compact, mobile, [nav]);
  expect(right.x).toBe(322);
  expect(overlaps({ ...right, ...compact }, nav)).toBe(false);
  expect(dockPosition({ x: 100, y: 300 }, compact, mobile, []).x).toBe(12);
});
test('docking respects a shifted visual viewport when the phone keyboard opens', () => {
  const compact = { width: 56, height: 80 };
  const viewport = { width: 390, height: 350, top: 180, left: 20 };
  const position = dockPosition({ x: 500, y: 900 }, compact, viewport, []);
  expect(position).toEqual({ x: 342, y: 438 });
});
