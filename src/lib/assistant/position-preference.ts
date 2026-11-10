import { clampPosition, type Point, type Viewport } from './position';

type SavedPosition = { version: 1; x: number; y: number };
export function parsePosition(raw: string | null): SavedPosition | null {
  if (!raw || raw.length > 256) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < 0 || value.x > 1 || value.y < 0 || value.y > 1) return null;
    return { version: 1, x: value.x, y: value.y };
  } catch { return null; }
}
export function savePosition(point: Point, size: { width: number; height: number }, viewport: Viewport): SavedPosition {
  const p = clampPosition(point, size, viewport);
  return { version: 1, x: (p.x - (viewport.left ?? 0) - 12) / Math.max(1, viewport.width - size.width - 24), y: (p.y - (viewport.top ?? 0) - 12) / Math.max(1, viewport.height - size.height - 24) };
}
export function restorePosition(saved: SavedPosition, size: { width: number; height: number }, viewport: Viewport): Point {
  return clampPosition({ x: (viewport.left ?? 0) + 12 + saved.x * Math.max(0, viewport.width - size.width - 24), y: (viewport.top ?? 0) + 12 + saved.y * Math.max(0, viewport.height - size.height - 24) }, size, viewport);
}
