export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type Viewport = { width: number; height: number; top?: number; left?: number };
const gap = 8;
export function clampPosition(point: Point, size: { width: number; height: number }, viewport: Viewport): Point {
  const left = (viewport.left ?? 0) + 12, top = (viewport.top ?? 0) + 12;
  return { x: Math.max(left, Math.min(point.x, left + viewport.width - size.width - 24)), y: Math.max(top, Math.min(point.y, top + viewport.height - size.height - 24)) };
}
export function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

// Prefer the drop point, then the nearest free edge/grid location. Never cover a control.
export function safePosition(point: Point, size: { width: number; height: number }, viewport: Viewport, obstacles: Box[]): Point | null {
  if (size.width + 24 > viewport.width || size.height + 24 > viewport.height) return null;
  const desired = clampPosition(point, size, viewport);
  const free = (p: Point) => !obstacles.some(b => overlaps({ ...p, ...size }, b));
  if (free(desired)) return desired;
  const candidates: Point[] = [];
  for (const b of obstacles) {
    const xs = [b.x - size.width - gap, b.x + b.width + gap, desired.x];
    const ys = [b.y - size.height - gap, b.y + b.height + gap, desired.y];
    for (const x of xs) for (const y of ys) candidates.push({ x, y });
  }
  for (let x = 12; x < viewport.width; x += 48) for (let y = 12; y < viewport.height; y += 48) candidates.push({ x: x + (viewport.left ?? 0), y: y + (viewport.top ?? 0) });
  for (const x of [12, viewport.width - size.width - 12]) for (const y of [12, viewport.height - size.height - 12]) candidates.push({ x: x + (viewport.left ?? 0), y: y + (viewport.top ?? 0) });
  let best: Point | null = null, distance = Infinity;
  for (const candidate of candidates) {
    const p = clampPosition(candidate, size, viewport), d = (p.x - desired.x) ** 2 + (p.y - desired.y) ** 2;
    if (d < distance && free(p)) { best = p; distance = d; }
  }
  return best;
}

// Keep the assistant at an edge, trying nearby vertical spaces before falling back.
export function dockPosition(point: Point, size: { width: number; height: number }, viewport: Viewport, obstacles: Box[]): Point {
  const bounded = clampPosition(point, size, viewport);
  const left = (viewport.left ?? 0) + 12;
  const right = Math.max(left, left + viewport.width - size.width - 24);
  const xs = bounded.x + size.width / 2 < (viewport.left ?? 0) + viewport.width / 2 ? [left, right] : [right, left];
  const ys = [bounded.y, ...obstacles.flatMap(b => [b.y - size.height - gap, b.y + b.height + gap])];
  for (const x of xs) {
    const candidates = ys.map(y => clampPosition({ x, y }, size, viewport)).sort((a, b) => Math.abs(a.y - bounded.y) - Math.abs(b.y - bounded.y));
    const free = candidates.find(p => !obstacles.some(b => overlaps({ ...p, ...size }, b)));
    if (free) return free;
  }
  return safePosition({ x: xs[0], y: bounded.y }, size, viewport, obstacles) ?? bounded;
}
