'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Magnet from '@/components/react-bits/Magnet';

const motionQuery = '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)';
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const canAnimate = () => window.matchMedia(motionQuery).matches;
const serverMotion = () => false;

/** Progressive enhancement: server-rendered content is always readable without JS. */
export function LandingMotion({ children, className }: { children: ReactNode; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useSyncExternalStore(subscribeMotion, canAnimate, serverMotion);

  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root || !('IntersectionObserver' in window) || !('animate' in HTMLElement.prototype)) return;
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        // Focused controls must stay still; no content is hidden while waiting to enter.
        if (element.matches(':focus-within')) return;
        const animation = element.animate([
          { opacity: .85, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ], { duration: 440, easing: 'cubic-bezier(.2,.65,.3,1)' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: .08 });
    root.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
    return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()); };
  }, [enabled]);

  return <div ref={ref} className={className}>{children}</div>;
}

/** Official React Bits Magnet, bounded to 3px and disabled for keyboard/touch use. */
export function LandingMagnet({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribeMotion, canAnimate, serverMotion);
  const [focused, setFocused] = useState(false);
  return <div onFocusCapture={() => setFocused(true)} onBlurCapture={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
  }}>
    <Magnet wrapperClassName="landing-magnet" padding={12} magnetStrength={8} maxOffset={3} spring={{ damping: 28 }} disabled={!enabled || focused}>{children}</Magnet>
  </div>;
}
