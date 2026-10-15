'use client';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ANIMATED_SOURCES, type AnimatedSourceId } from './animatedSources';
import { cx } from '../ui/cx';

const QUERY = '(prefers-reduced-motion: reduce)';
const subscribe = (cb: () => void) => { const m = window.matchMedia?.(QUERY); m?.addEventListener?.('change', cb); return () => m?.removeEventListener?.('change', cb); };
const reducedNow = () => !!window.matchMedia?.(QUERY).matches;
/** True on the server and until the browser confirms the user has not asked for reduced motion. */
export const useReducedMotion = () => useSyncExternalStore(subscribe, reducedNow, () => true);

/**
 * Inline SVG with SMIL animation on the original layers (paddle wheel, splash, flow, fish tail, farmer arms).
 * It moves only while `active`, the user has not asked for reduced motion, and it is on screen; otherwise it rests on its first frame.
 * `title` is the accessible name. The markup is generated from our own asset sheet at build time, never from user input.
 */
export function AnimatedIllustration({ source, active, title, size = 96, className }: { source: AnimatedSourceId; active: boolean; title: string; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  const visible = useRef(true);
  const run = active && !reduced;

  useEffect(() => {
    const svg = ref.current; if (!svg) return;
    const apply = () => {
      if (run && visible.current) svg.unpauseAnimations?.();
      else { svg.pauseAnimations?.(); svg.setCurrentTime?.(0); }
    };
    apply();
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => { visible.current = e?.isIntersecting ?? true; apply(); });
    io.observe(svg);
    return () => io.disconnect();
  }, [run]);

  return (
    <svg
      ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="-150 -150 300 300" role="img" aria-label={title}
      width={size} height={size} style={{ width: size }} strokeLinejoin="round" strokeLinecap="round"
      className={cx('aq-illustration h-auto max-w-full shrink-0 select-none', className)} data-animating={run ? 'true' : 'false'}
      dangerouslySetInnerHTML={{ __html: ANIMATED_SOURCES[source] }}
    />
  );
}
