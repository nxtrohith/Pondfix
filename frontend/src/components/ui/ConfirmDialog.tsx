'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

/** Native <dialog>: focus trap, Escape to cancel and inert background come from the platform. */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close?.();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }} onClick={(e) => { if (e.target === ref.current) onCancel(); }} aria-labelledby="confirm-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-0 text-ink backdrop:bg-ink/30">
      <div className="p-6">
        <h2 id="confirm-title" className="text-base font-medium">{title}</h2>
        <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy}>{busy ? 'Submitting' : confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}
