'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './BoardingHouseScenery.module.css';

/** Visible by default; looping scenery has an accessible pause control. */
export function BoardingHouseScenery({ loop = false }: { loop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    update();
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.some(entry => entry.isIntersecting);
      setInView(visible);
      if (visible) element.dataset.arrived = 'true';
    }, { threshold: .15 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <>
    {loop && <button type="button" className={styles.motionToggle} onClick={() => setPaused(value => !value)}
      aria-label={paused ? 'Resume scenery animation' : 'Pause scenery animation'} title={paused ? 'Resume scenery animation' : 'Pause scenery animation'}>
      {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
    </button>}
    <div ref={ref} className={styles.scenery} aria-hidden="true" data-paused={paused || !inView || hidden}
      style={{ '--scene-repeats': loop ? 'infinite' : '1', '--cloud-duration': loop ? '12s' : '4.8s' } as CSSProperties}>
    <svg viewBox="0 0 500 570" fill="none" preserveAspectRatio="xMidYMid slice" focusable="false">
      <g className={styles.sun}><circle cx="414" cy="117" r="43" className={styles.sunHalo} /><circle cx="414" cy="117" r="24" className={styles.sunCore} /><path d="M414 78v-6m0 90v-6m-39-39h-6m90 0h-6m-67-28-5-5m61 61 5 5m-61-5-5 5m61-61 5-5" className={styles.sunRays} /></g>
      <g className={styles.cloudNear}><path d="M36 128h81a14 14 0 0 0-9-26 23 23 0 0 0-44-6 16 16 0 0 0-23 15 9 9 0 0 0-5 17Z" className={styles.cloudFill} /><path d="M43 137h49" className={styles.cloudLine} /></g>
      <g className={styles.cloudFar}><path d="M304 174h60a10 10 0 0 0-7-19 17 17 0 0 0-33-4 12 12 0 0 0-17 11 6 6 0 0 0-3 12Z" className={styles.cloudFill} /></g>
      <path d="M14 393c60-17 103-16 157-8m166 1c53-11 106-8 149 9" className={styles.ground} />
      <g className={styles.plantLeft}><path d="M35 393v-87m0 49-19-24m19 6 17-23" className={styles.stem} /><path d="M34 350C8 350 7 330 10 316c16 3 25 13 24 34Zm2-21c-1-23 9-35 27-40 3 18-5 35-27 40Zm-2-13c-20-11-20-28-13-40 16 8 21 21 13 40Z" className={styles.leaf} /><path d="M21 380h29l-5 25H26Z" className={styles.pot} /></g>
      <g className={styles.plantRight}><path d="M460 408V302m0 58 19-26m-19 2-18-24" className={styles.stem} /><path d="M461 350c26-2 31-21 27-37-18 5-28 17-27 37Zm-2-21c-24-3-34-18-31-34 19 1 31 14 31 34Zm1-18c-10-22-4-38 10-47 11 16 8 34-10 47Z" className={styles.leaf} /><path d="M445 394h31l-5 27h-21Z" className={styles.pot} /></g>
      <g className={styles.birds}><path d="M154 117q5-7 10 0 5-7 10 0m90-25q4-5 8 0 4-5 8 0" className={styles.birdLine} /></g>
    </svg>
  </div></>;
}
