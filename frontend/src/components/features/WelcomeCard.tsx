'use client';
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { X } from '@phosphor-icons/react/dist/ssr';
import { FarmerActionIllustration } from '../illustrations';

const KEY = 'aquaguard.welcome.dismissed';
const listeners = new Set<() => void>();
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
function dismiss() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode: it simply reappears next visit */ } listeners.forEach((l) => l()); }

/** One-time orientation for new users. Hidden on the server and until the browser confirms it was not dismissed before. */
export function WelcomeCard() {
  const dismissed = useSyncExternalStore(subscribe, read, () => true);
  if (dismissed) return null;
  return (
    <section aria-labelledby="welcome-title" className="relative rounded-xl border border-line bg-brand-pale p-5">
      <button type="button" onClick={dismiss} aria-label="Hide this introduction" className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-lg text-brand-text hover:bg-card/60"><X size={16} aria-hidden="true" /></button>
      <div className="flex items-center gap-5 pr-8">
        <span aria-hidden="true" className="hidden shrink-0 md:block"><FarmerActionIllustration pose="neutral" size={88} className="-my-3" /></span>
        <div className="min-w-0 flex-1">
      <h2 id="welcome-title" className="text-base font-medium tracking-tight text-ink">New here? This is how PondFix works</h2>
      <ul className="mt-2 grid gap-2 text-sm text-ink md:grid-cols-3">
        <li><span className="font-medium">It watches every pond for you:</span> oxygen in the water, pH and water temperature, from the pond device.</li>
        <li><span className="font-medium">It tells you in words and symbols:</span> a tick means healthy, a triangle means check today, a red octagon means act now, a question mark means no recent reading.</li>
        <li><span className="font-medium">The box at the top</span> always says if your ponds are safe and what to do first. <Link href="/help" className="font-medium text-brand-text underline underline-offset-2">Help</Link> explains every reading.</li>
      </ul>
        </div>
      </div>
    </section>
  );
}
