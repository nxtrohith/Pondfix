'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowClockwise, BookOpenText, Check, ClockCounterClockwise, Copy, Drop, NotePencil, SpeakerHigh, Sparkle, Stop, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { ApiError, browserApi } from '@/lib/api/client';
import type { ChatSource, Pond } from '@/lib/api/schemas';
import { PUBLIC_API_BASE_URL } from '@/lib/env';
import { useApiQuery } from '@/lib/useApiQuery';
import { formatDateTime } from '@/lib/format';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { cx } from '../ui/cx';
import { Composer } from './Composer';
import { Markdown } from './Markdown';

interface Message { id: string; role: 'user' | 'assistant'; text: string; sources?: ChatSource[]; failed?: boolean; retryText?: string; streaming?: boolean; stopped?: boolean }

const SUGGESTIONS = [
  { title: 'How is this pond doing?', body: 'Summarise the current readings and open alerts.' },
  { title: 'Fish are gulping at the surface', body: 'What should I do right now?' },
  { title: 'Why does dissolved oxygen drop at night?', body: 'Explain it simply and how to prepare.' },
  { title: 'Is my pH safe for these fish?', body: 'Check it against the ranges for my species.' },
];

const errorText = (e: unknown) => e instanceof ApiError ? (e.code === 'CHAT_LLM_UNAVAILABLE' ? 'The assistant could not write an answer right now. Please try again in a moment.' : e.message) : 'Something went wrong. Please try again.';
let counter = 0;
const uid = () => `m${Date.now()}-${counter++}`;

function Dots() {
  return (
    <div role="status" aria-label="PondFix is writing an answer" className="flex items-center gap-1 py-2">
      {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-brand-soft motion-reduce:animate-none" style={{ animationDelay: `${i * 140}ms` }} />)}
    </div>
  );
}

function SourceCard({ source, open }: { source: ChatSource; open: boolean }) {
  const title = (source.topic ?? source.source?.split('/').pop()?.replace(/\.md$/, '') ?? (source.kind === 'note' ? 'Your field note' : 'Earlier question')).replace(/[_-]/g, ' ').replace(/\bph\b/i, 'pH').replace(/\bfaq\b/i, 'FAQ');
  const provisional = source.review_status === 'pending_expert_review';
  return (
    <li id={`src-${source.citation}`} className={cx('rounded-lg border bg-card px-3 py-2 text-sm transition-colors', open ? 'border-brand bg-brand-pale/50' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full bg-brand-pale px-1.5 text-xs font-semibold text-brand-text">{source.citation}</span>
        <span className="font-medium text-ink first-letter:uppercase">{title}</span>
        {source.category ? <span className="text-ink-soft">· {source.category.replace(/_/g, ' ')}</span> : null}
        {provisional ? <span className="rounded-full bg-warn-bg px-2 py-px text-xs font-medium text-warn-text">Provisional, not expert-reviewed</span> : null}
        {source.kind === 'note' || source.kind === 'conversation' ? <span className="rounded-full bg-surface px-2 py-px text-xs text-ink-soft">From this pond&apos;s history</span> : null}
      </div>
    </li>
  );
}

/** Strips markdown and [n] citation markers, then splits into chunks the translate and speech endpoints accept (<= 1400 chars). */
function speakableChunks(md: string): string[] {
  const plain = md.replace(/```[\s\S]*?```/g, ' ').replace(/\[\d+\]/g, '').replace(/[*_`#>]+/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
  const chunks: string[] = []; let cur = '';
  for (const sentence of plain.match(/[^.!?]+[.!?]*\s*/g) ?? [plain]) {
    if (cur && (cur + sentence).length > 1400) { chunks.push(cur.trim()); cur = ''; }
    cur += sentence;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.slice(0, 4);
}

async function postJson(path: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(`${PUBLIC_API_BASE_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res;
}

/** Translates an answer to Telugu (Sarvam) and reads it aloud (Sarvam TTS). */
function useTeluguVoice(text: string) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const ctrl = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useCallback(() => { ctrl.current?.abort(); audio.current?.pause(); audio.current = null; setState('idle'); }, []);
  useEffect(() => stop, [stop]);
  const start = useCallback(async () => {
    const c = new AbortController(); ctrl.current = c; setState('loading');
    try {
      const chunks = speakableChunks(text);
      const tr = await (await postJson('/translate', { targetLanguage: 'te', items: chunks }, c.signal)).json() as { items: { translated: string; status: string }[] };
      for (const [i, item] of tr.items.entries()) {
        const blob = await (await postJson('/tts', { text: item.translated, language: 'te' }, c.signal)).blob();
        const url = URL.createObjectURL(blob); const a = new Audio(url); audio.current = a;
        await new Promise<void>((resolve, reject) => { a.onended = () => resolve(); a.onerror = () => reject(new Error('playback')); void a.play().then(() => { if (i === 0) setState('playing'); }, reject); });
        URL.revokeObjectURL(url);
      }
      setState('idle');
    } catch (e) { if (!c.signal.aborted) setState('error'); }
  }, [text]);
  return { state, start, stop };
}

function AssistantMessage({ m, onRetry }: { m: Message; onRetry: (text: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sources = m.sources ?? [];
  const voice = useTeluguVoice(m.text);
  const copy = () => { void navigator.clipboard?.writeText(m.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  const cite = (c: string) => { setOpen(c); requestAnimationFrame(() => document.getElementById(`src-${c}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })); };
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true"><Sparkle size={16} weight="fill" /></span>
      <div className="min-w-0 flex-1">
        {m.failed ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-crit-line bg-crit-bg px-3.5 py-3 text-sm text-crit-text">
            <WarningCircle size={18} className="mt-px shrink-0" aria-hidden="true" />
            <div className="min-w-0"><p>{m.text}</p>
              {m.retryText ? <Button size="sm" className="mt-2" onClick={() => onRetry(m.retryText!)}><ArrowClockwise size={14} aria-hidden="true" /> Try again</Button> : null}
            </div>
          </div>
        ) : (
          <>
            <Markdown text={m.text} citations={sources.map((s) => s.citation)} onCite={cite} />
            {m.streaming ? <span aria-hidden="true" className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" /> : null}
            {m.stopped ? <p className="mt-1 text-[12px] italic text-ink-muted">Stopped. This partial answer was not saved.</p> : null}
            {m.streaming ? null : <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={copy} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-soft hover:bg-surface hover:text-ink">
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" onClick={voice.state === 'idle' || voice.state === 'error' ? () => void voice.start() : voice.stop} aria-label={voice.state === 'playing' || voice.state === 'loading' ? 'Stop Telugu voice' : 'Listen in Telugu'} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-soft hover:bg-surface hover:text-ink">
                {voice.state === 'playing' || voice.state === 'loading' ? <Stop size={14} aria-hidden="true" /> : <SpeakerHigh size={14} aria-hidden="true" />}
                {voice.state === 'loading' ? 'Translating…' : voice.state === 'playing' ? 'Stop' : voice.state === 'error' ? 'Voice unavailable, retry' : 'తెలుగులో వినండి'}
              </button>
              {sources.length ? (
                <button type="button" aria-expanded={open !== null} onClick={() => setOpen(open === null ? (sources[0]?.citation ?? null) : null)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-ink-soft hover:bg-surface hover:text-ink">
                  <BookOpenText size={14} aria-hidden="true" />{sources.length} {sources.length === 1 ? 'source' : 'sources'}
                </button>
              ) : null}
            </div>}
            {open !== null && !m.streaming ? <ul className="mt-2 space-y-1.5">{sources.map((s) => <SourceCard key={s.citation} source={s} open={s.citation === open} />)}</ul> : null}
          </>
        )}
      </div>
    </div>
  );
}

function ChatPane({ pond, initialConversation }: { pond: Pond; initialConversation: string | null }) {
  const api = useMemo(() => browserApi(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(initialConversation);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(initialConversation));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const live = useRef<AbortController | null>(null);
  const stick = useRef(true);
  const conversations = useApiQuery((s) => api.chatConversations(pond.id, s), [pond.id]);

  const load = useCallback(async (id: string) => {
    live.current?.abort();
    const ctrl = new AbortController(); live.current = ctrl;
    stick.current = true; setLoadingHistory(true); setConversationId(id); setMessages([]); setShowHistory(false);
    try {
      const h = await api.chatHistory(pond.id, id, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setMessages(h.items.flatMap((t) => [{ id: `${t.id}q`, role: 'user' as const, text: t.question }, { id: `${t.id}a`, role: 'assistant' as const, text: t.answer, sources: t.sources }]));
    } catch (e) {
      if (!ctrl.signal.aborted) setMessages([{ id: uid(), role: 'assistant', text: errorText(e), failed: true }]);
    } finally { if (!ctrl.signal.aborted) setLoadingHistory(false); }
  }, [api, pond.id]);

  useEffect(() => { if (initialConversation) void load(initialConversation); return () => live.current?.abort(); }, [initialConversation, load]);
  useEffect(() => { if (stick.current) bottom.current?.scrollIntoView({ block: 'end', behavior: 'auto' }); }, [messages, busy]);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    const answerId = uid();
    const ctrl = new AbortController(); live.current = ctrl;
    const patch = (fn: (m: Message) => Message) => setMessages((all) => all.map((m) => (m.id === answerId ? fn(m) : m)));
    setInput(''); setBusy(true); stick.current = true;
    setMessages((m) => [...m.filter((x) => !x.failed), { id: uid(), role: 'user', text }]);
    try {
      const r = await api.chatStream(pond.id, { message: text, ...(conversationId ? { conversationId } : {}) }, {
        onStart: (d) => { setConversationId(d.conversationId); setMessages((all) => [...all, { id: answerId, role: 'assistant', text: '', sources: d.sources, streaming: true }]); },
        onDelta: (t) => patch((m) => ({ ...m, text: m.text + t })),
      }, ctrl.signal);
      setConversationId(r.conversationId);
      patch((m) => ({ ...m, text: r.answer, sources: r.sources, streaming: false }));
      conversations.reload();
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'aborted') {
        setMessages((all) => all.flatMap((m) => (m.id !== answerId ? [m] : m.text.trim() ? [{ ...m, streaming: false, stopped: true }] : [])));
      } else {
        setMessages((all) => [...all.filter((m) => m.id !== answerId), { id: uid(), role: 'assistant', text: errorText(e), failed: true, retryText: text }]);
      }
    } finally { setBusy(false); }
  }, [api, busy, conversationId, conversations, pond.id]);

  const retry = (text: string) => { setMessages((m) => m.slice(0, -2)); void send(text); };
  const stop = () => live.current?.abort();
  const fresh = () => { live.current?.abort(); setMessages([]); setConversationId(null); setLoadingHistory(false); setShowHistory(false); setInput(''); };
  const items = conversations.data?.items ?? [];

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Conversations" className={cx('min-h-0 flex-col rounded-xl border border-line bg-card lg:flex', showHistory ? 'flex' : 'hidden')}>
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <h2 className="text-sm font-semibold text-ink">Conversations</h2>
          <button type="button" onClick={fresh} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-brand-text hover:bg-brand-pale"><NotePencil size={14} aria-hidden="true" /> New chat</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {conversations.loading && !conversations.data ? <div className="space-y-2 p-1"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
            : conversations.error ? <p className="px-2 py-3 text-[12.5px] text-ink-soft">Past conversations could not be loaded.</p>
            : items.length === 0 ? <p className="px-2 py-3 text-[12.5px] text-ink-soft">No conversations yet for {pond.name}. Ask a question to start one.</p>
            : <ul className="space-y-0.5">{items.map((c) => (
              <li key={c.conversationId}>
                <button type="button" onClick={() => void load(c.conversationId)} aria-current={c.conversationId === conversationId ? 'true' : undefined}
                  className={cx('w-full rounded-lg px-2.5 py-2 text-left transition-colors', c.conversationId === conversationId ? 'bg-brand-pale' : 'hover:bg-surface')}>
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">{c.title}</span>
                  <span className="mt-0.5 block text-[11.5px] text-ink-soft">{formatDateTime(c.updatedAt)} · {c.turns} {c.turns === 1 ? 'question' : 'questions'}</span>
                </button>
              </li>))}</ul>}
        </div>
      </aside>

      <section aria-label={`Chat about ${pond.name}`} className="flex min-h-0 flex-col rounded-xl border border-line bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5 lg:hidden">
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}><ClockCounterClockwise size={15} aria-hidden="true" /> History</Button>
          <Button size="sm" variant="ghost" onClick={fresh}><NotePencil size={15} aria-hidden="true" /> New chat</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6" aria-busy={busy || loadingHistory}
          onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {loadingHistory ? <div className="space-y-4"><Skeleton className="ml-auto h-10 w-2/3" /><Skeleton className="h-24 w-full" /></div>
            : messages.length === 0 ? (
              <div className="flex min-h-full"><div className="m-auto flex max-w-2xl flex-col items-center py-6 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-pale text-brand-text" aria-hidden="true"><Sparkle size={24} weight="fill" /></span>
                <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">Ask about {pond.name}</h2>
                <p className="mt-1.5 max-w-[52ch] text-sm text-ink-soft">Answers use this pond&apos;s latest readings together with the PondFix aquaculture library, and cite their sources. It cannot control equipment or change alerts.</p>
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} type="button" onClick={() => void send(`${s.title} ${s.body}`)} className="rounded-xl border border-line bg-page px-3.5 py-3 text-left transition-all duration-150 hover:-translate-y-px hover:border-brand-soft hover:bg-hover active:translate-y-0">
                      <span className="block text-sm font-medium text-ink">{s.title}</span><span className="mt-0.5 block text-[12.5px] text-ink-soft">{s.body}</span>
                    </button>))}
                </div>
              </div></div>
            ) : (
              <ol className="mx-auto max-w-3xl space-y-6">
                {messages.map((m) => (
                  <li key={m.id} className="aq-message-in">
                    {m.role === 'user'
                      ? <div className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-[14.5px] leading-relaxed text-white">{m.text}</p></div>
                      : <AssistantMessage m={m} onRetry={retry} />}
                  </li>))}
                {busy && !messages.some((m) => m.streaming) ? <li className="flex gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white" aria-hidden="true"><Sparkle size={16} weight="fill" /></span><Dots /></li> : null}
              </ol>)}
          <div ref={bottom} />
        </div>
        <div className="border-t border-line px-3 py-3 md:px-5">
          <div className="mx-auto max-w-3xl">
            <Composer value={input} onChange={setInput} onSend={() => void send(input)} onStop={stop} busy={busy} disabled={loadingHistory} placeholder={`Ask about ${pond.name}…`} />
            <p className="mt-2 text-center text-[11.5px] text-ink-muted">AI can make mistakes. Library ranges are provisional. Check readings and call a qualified aquaculture professional for urgent problems.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ChatWorkspace({ ponds, pondId, conversationId }: { ponds: Pond[]; pondId: string; conversationId: string | null }) {
  const router = useRouter();
  const pond = ponds.find((p) => p.id === pondId) ?? ponds[0];
  if (!pond) return null;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="chat-pond" className="flex items-center gap-1.5 text-sm font-medium text-ink"><Drop size={16} className="text-brand-text" aria-hidden="true" /> Pond</label>
        <select id="chat-pond" value={pond.id} onChange={(e) => router.replace(`/chat?pond=${encodeURIComponent(e.target.value)}`)}
          className="h-9 min-w-[10rem] rounded-lg border border-line bg-card px-3 text-sm text-ink focus-visible:border-brand">
          {ponds.map((p) => <option key={p.id} value={p.id}>{p.name}{p.species ? ` · ${p.species}` : ''}</option>)}
        </select>
      </div>
      {/* Keyed by pond so switching ponds can never show another pond's conversation. */}
      <ChatPane key={pond.id} pond={pond} initialConversation={pond.id === pondId ? conversationId : null} />
    </div>
  );
}
