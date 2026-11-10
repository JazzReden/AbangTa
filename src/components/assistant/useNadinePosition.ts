'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { clampPosition, dockPosition, type Point, type Viewport } from '@/lib/assistant/position';
import { parsePosition, restorePosition, savePosition } from '@/lib/assistant/position-preference';

export function useNadinePosition(onDrag: () => void, storageKey?: string) {
  const root = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<Point | null>(null), [dragging, setDragging] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({ left: 12, bottom: '15rem' });
  const current = useRef<Point | null>(null), gesture = useRef<{ id: number; start: Point; origin: Point; moved: boolean } | null>(null);
  const preferred = useRef<ReturnType<typeof parsePosition>>(null);
  const suppressClick = useRef(false), onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const geometry = useCallback(() => {
    const element = root.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect(), vv = window.visualViewport;
    const viewport: Viewport = { width: vv?.width ?? innerWidth, height: vv?.height ?? innerHeight, left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 };
    const obstacles = Array.from(document.querySelectorAll('nav, [role="navigation"], button, a[href], input, select, textarea, [role="button"]'))
      .filter(node => !element.contains(node))
      .filter(node => !node.matches('nav, [role="navigation"]') || node.getBoundingClientRect().width >= viewport.width * 0.8)
      .map(node => node.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)
      .map(r => ({ x: r.left, y: r.top, width: r.width, height: r.height }));
    return { viewport, size: { width: rect.width, height: rect.height }, origin: { x: rect.left, y: rect.top }, obstacles };
  }, []);
  const place = useCallback((desired?: Point, live = false) => {
    const g = geometry(); if (!g) return;
    const target = desired ?? (preferred.current ? restorePosition(preferred.current, g.size, g.viewport) : current.current) ?? g.origin;
    const bounded = clampPosition(target, g.size, g.viewport);
    const p = live ? bounded : dockPosition(target, g.size, g.viewport, g.obstacles);
    current.current = p; setPosition(p);
    const width = Math.min(384, g.viewport.width - 24), left = Math.max((g.viewport.left ?? 0) + 12, Math.min(p.x, (g.viewport.left ?? 0) + g.viewport.width - width - 12));
    const topEdge = (g.viewport.top ?? 0) + 12;
    let bottomEdge = (g.viewport.top ?? 0) + g.viewport.height - 12;
    for (const nav of document.querySelectorAll('nav, [role="navigation"]')) {
      const r = nav.getBoundingClientRect();
      if (r.width >= g.viewport.width * 0.8 && r.height > 0 && r.bottom >= bottomEdge && r.top > topEdge) bottomEdge = Math.min(bottomEdge, r.top - 8);
    }
    const above = p.y - topEdge - 12, below = bottomEdge - p.y - g.size.height - 12;
    if (above >= below) setPanelStyle({ left, bottom: innerHeight - p.y + 12, maxHeight: Math.max(120, Math.min(576, above)) });
    else setPanelStyle({ left, top: p.y + g.size.height + 12, maxHeight: Math.max(120, Math.min(576, below)) });
  }, [geometry]);
  useEffect(() => {
    try { preferred.current = storageKey ? parsePosition(window.localStorage.getItem(storageKey)) : null; } catch { preferred.current = null; }
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!gesture.current) place(); }); };
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update);
    // Page controls can change after background data refresh or a menu opens.
    const observer = new MutationObserver(records => { if (records.some(r => !root.current?.contains(r.target))) update(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'style', 'class'] });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); };
  }, [place, storageKey]);
  function remember() {
    const g = geometry(); if (!g || !current.current) return;
    preferred.current = savePosition(current.current, g.size, g.viewport);
    try { if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(preferred.current)); } catch { /* Dragging still works when storage is unavailable. */ }
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    const g = geometry(); if (!g) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: g.origin, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.start.x, dy = event.clientY - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < 7) return;
    if (!g.moved) { g.moved = true; suppressClick.current = true; setDragging(true); onDragRef.current(); }
    place({ x: g.origin.x + dx, y: g.origin.y + dy }, true);
  }
  function pointerEnd(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    gesture.current = null; setDragging(false);
    if (g.moved) { place(current.current ?? g.origin); remember(); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyboardMove(event: KeyboardEvent<HTMLButtonElement>) {
    const deltas: Record<string, Point> = { ArrowLeft: { x: -32, y: 0 }, ArrowRight: { x: 32, y: 0 }, ArrowUp: { x: 0, y: -32 }, ArrowDown: { x: 0, y: 32 } };
    const delta = deltas[event.key]; if (!delta) { if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false; return; }
    event.preventDefault(); const g = geometry(); if (!g) return;
    onDragRef.current(); place({ x: g.origin.x + delta.x, y: g.origin.y + delta.y }); remember();
  }
  return { root, dragging, panelStyle, style: { ...(position ? { left: position.x, top: position.y, bottom: 'auto' } : {}) } as CSSProperties,
    pointerDown, pointerMove, pointerEnd, keyboardMove,
    consumeDrag: () => { const value = suppressClick.current; suppressClick.current = false; return value; } };
}
