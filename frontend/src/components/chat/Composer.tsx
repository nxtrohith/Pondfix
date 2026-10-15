'use client';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, Stop } from '@phosphor-icons/react/dist/ssr';
import { cx } from '../ui/cx';

export const MAX_MESSAGE = 4000;

/** Auto-growing message box: Enter sends, Shift+Enter adds a line. */
export function Composer({ value, onChange, onSend, onStop, busy, disabled, placeholder }: { value: string; onChange: (v: string) => void; onSend: () => void; onStop?: () => void; busy: boolean; disabled?: boolean; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && !busy && value.trim().length > 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSend) onSend(); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSend) onSend(); }}
      className={cx('rounded-2xl border bg-card p-2 shadow-[0_1px_2px_rgba(52,55,47,0.04)] transition-colors focus-within:border-brand', disabled ? 'border-line opacity-60' : 'border-line-strong')}>
      <label htmlFor="chat-input" className="sr-only">Message to the pond assistant</label>
      <textarea id="chat-input" ref={ref} rows={1} value={value} maxLength={MAX_MESSAGE} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onKeyDown={onKey}
        className="block max-h-[180px] w-full resize-none bg-transparent px-2.5 py-2 text-[14.5px] leading-relaxed text-ink placeholder:text-ink-muted focus:outline-none focus-visible:outline-none" />
      <div className="flex items-center justify-between gap-3 px-1.5 pt-1">
        <p className="text-[12px] text-ink-muted"><kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> for a new line{value.length > MAX_MESSAGE * 0.85 ? ` · ${value.length}/${MAX_MESSAGE}` : ''}</p>
        {busy && onStop ? (
          <button type="button" onClick={onStop} aria-label="Stop generating"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-all duration-150 hover:bg-ink/85 active:scale-95"><Stop size={16} weight="fill" aria-hidden="true" /></button>
        ) : (
          <button type="submit" disabled={!canSend} aria-label="Send message"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-all duration-150 hover:bg-brand-hover active:scale-95 disabled:bg-surface disabled:text-ink-muted"><ArrowUp size={18} weight="bold" aria-hidden="true" /></button>
        )}
      </div>
    </form>
  );
}
