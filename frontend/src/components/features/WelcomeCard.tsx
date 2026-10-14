'use client';
import { useSyncExternalStore } from 'react';
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
    <section aria-labelledby="welcome-title" className="relative rounded-xl border border-line bg-sage-pale p-5">
      <button type="button" onClick={dismiss} aria-label="Hide this introduction" className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-olive-text hover:bg-card/60"><X size={16} aria-hidden="true" /></button>
      <div className="flex items-center gap-5 pr-8">
        <span aria-hidden="true" className="hidden shrink-0 md:block"><FarmerActionIllustration pose="neutral" size={88} className="-my-3" /></span>
        <div className="min-w-0 flex-1">
      <h2 id="welcome-title" className="text-base font-medium tracking-tight text-ink">New here? This is how AquaGuard works</h2>
      <ul className="mt-2 grid gap-2 text-[13px] text-ink md:grid-cols-3">
        <li><span className="font-medium">It watches three things in every pond:</span> oxygen, pH and water temperature.</li>
        <li><span className="font-medium">It tells you in words:</span> green means healthy, amber means attention is needed, red means act now, grey means no recent reading.</li>
        <li><span className="font-medium">Start with “Needs attention now”</span> below. Open <em>Ponds</em> for each pond&apos;s readings and forecast, or try the <em>Demo</em> to see an alert without any risk.</li>
      </ul>
        </div>
      </div>
    </section>
  );
}
