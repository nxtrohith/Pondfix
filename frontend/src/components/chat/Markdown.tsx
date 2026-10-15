import { Fragment, type ReactNode } from 'react';
import { cx } from '../ui/cx';

/** Small, safe renderer for assistant replies: paragraphs, headings, lists, **bold**, `code` and [S1] citation chips. No HTML is ever injected. */
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[S\d+\])/g;

function inline(text: string, onCite?: (citation: string) => void, known?: Set<string>): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[12.5px]">{part.slice(1, -1)}</code>;
    const cite = /^\[(S\d+)\]$/.exec(part)?.[1];
    if (cite && known?.has(cite)) {
      return (
        <button key={i} type="button" onClick={() => onCite?.(cite)} aria-label={`Show source ${cite}`}
          className="mx-0.5 inline-flex h-[18px] min-w-[22px] -translate-y-px items-center justify-center rounded-full bg-sage-pale px-1.5 align-middle text-[11px] font-semibold text-olive-text transition-colors hover:bg-olive hover:text-white">
          {cite}
        </button>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

type Block = { type: 'p'; text: string } | { type: 'h'; text: string } | { type: 'ul'; items: string[] } | { type: 'ol'; items: string[] } | { type: 'hr' } | { type: 'table'; head: string[]; rows: string[][] };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const isRule = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
/** Models sometimes pad citations with zero-width or narrow no-break spaces. */
const clean = (src: string) => src.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[\u202f\u00a0]/g, ' ').replace(/\r/g, '');

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = clean(src).split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n] ?? '';
    const t = line.trim();
    if (t.startsWith('|') && isRule(lines[n + 1] ?? '')) {
      const rows: string[][] = [];
      n += 2;
      while (n < lines.length && (lines[n] ?? '').trim().startsWith('|')) { rows.push(cells(lines[n] ?? '')); n++; }
      n--;
      blocks.push({ type: 'table', head: cells(line), rows });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    const num = /^\d+[.)]\s+(.*)$/.exec(t);
    const head = /^#{1,4}\s+(.*)$/.exec(t);
    const last = blocks.at(-1);
    if (!t) { blocks.push({ type: 'p', text: '' }); continue; }
    if (/^([-*_])\1{2,}$/.test(t)) { blocks.push({ type: 'hr' }); continue; }
    if (head) blocks.push({ type: 'h', text: head[1] ?? '' });
    else if (bullet) { const item = bullet[1] ?? ''; if (last?.type === 'ul') last.items.push(item); else blocks.push({ type: 'ul', items: [item] }); }
    else if (num) { const item = num[1] ?? ''; if (last?.type === 'ol') last.items.push(item); else blocks.push({ type: 'ol', items: [item] }); }
    else if (last?.type === 'p' && last.text !== '') last.text += ` ${t}`;
    else blocks.push({ type: 'p', text: t });
  }
  return blocks.filter((b) => b.type !== 'p' || b.text !== '');
}

export function Markdown({ text, citations, onCite, className }: { text: string; citations?: string[]; onCite?: (citation: string) => void; className?: string }) {
  const known = new Set(citations);
  return (
    <div className={cx('space-y-2.5 text-[14.5px] leading-relaxed text-ink', className)}>
      {parse(text).map((b, i) => {
        if (b.type === 'hr') return <hr key={i} className="border-line" />;
        if (b.type === 'table') return (
          <div key={i} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
              <thead className="bg-head text-ink"><tr>{b.head.map((h, j) => <th key={j} scope="col" className="px-3 py-2 font-semibold">{inline(h, onCite, known)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j} className="border-t border-line align-top">{r.map((c, k) => <td key={k} className="px-3 py-2">{inline(c, onCite, known)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        if (b.type === 'h') return <p key={i} className="pt-1 font-semibold text-ink">{inline(b.text, onCite, known)}</p>;
        if (b.type === 'ul') return <ul key={i} className="list-disc space-y-1 pl-5 marker:text-sage">{b.items.map((it, j) => <li key={j}>{inline(it, onCite, known)}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i} className="list-decimal space-y-1 pl-5 marker:font-medium marker:text-olive-text">{b.items.map((it, j) => <li key={j}>{inline(it, onCite, known)}</li>)}</ol>;
        return <p key={i}>{inline(b.text, onCite, known)}</p>;
      })}
    </div>
  );
}
