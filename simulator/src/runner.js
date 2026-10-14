// Drives the generators: every interval, each pond whose dataSource is "simulator" gets one reading per interval slot, posted to
// POST /api/measurements with source "simulated" (the same pipeline hardware will use). On start it also fills the gap since the
// pond's last stored reading, up to `backfillHours`, so charts are not empty. Slots are aligned to the interval and idempotent.
import { createPondGenerator } from './generator.js';

const STATE_MAX_AGE_MIN = 360; // resume from the last stored reading only if it is this recent

export function createRunner({ apiUrl, intervalMinutes = 15, backfillHours = 24, fetchImpl = fetch, now = () => new Date(), log = console.log }) {
  const base = apiUrl.replace(/\/$/, '');
  const slotMs = intervalMinutes * 60000;
  const gens = new Map(); // pond id -> { gen, lastSlot }

  async function api(path, init) {
    const res = await fetchImpl(base + path, { headers: { 'content-type': 'application/json' }, ...init });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${res.status} ${body?.error?.message ?? text.slice(0, 120)}`);
    return body;
  }

  async function start(pond, current) {
    const latest = await api(`/ponds/${pond.id}/measurements/latest`).catch(() => ({ parameters: {} }));
    const params = latest.parameters ?? {};
    const initial = {}; let newest = 0;
    for (const [name, l] of Object.entries(params)) {
      const t = Date.parse(l.recordedAt);
      if (Number.isFinite(t)) newest = Math.max(newest, t);
      if (l.ageMinutes <= STATE_MAX_AGE_MIN) initial[name] = l.value;
    }
    const earliest = current - backfillHours * 3600000;
    const firstSlot = Math.ceil(Math.max(earliest, newest + 1) / slotMs) * slotMs;
    const entry = { gen: createPondGenerator(pond.sourceId ?? pond.id, initial), lastSlot: firstSlot - slotMs };
    gens.set(pond.id, entry);
    return entry;
  }

  async function runPond(pond, current) {
    const entry = gens.get(pond.id) ?? await start(pond, current);
    const currentSlot = Math.floor(current / slotMs) * slotMs;
    const behind = Math.floor((currentSlot - entry.lastSlot) / slotMs);
    if (behind > 1) log(`  ${pond.name}: catching up ${behind} readings`);
    let posted = 0; let failed = 0;
    for (let slot = entry.lastSlot + slotMs; slot <= currentSlot; slot += slotMs) {
      const values = entry.gen.step(new Date(slot));
      entry.lastSlot = slot;
      try {
        await api('/measurements', { method: 'POST', body: JSON.stringify({
          pondId: pond.id, recordedAt: new Date(slot).toISOString(), source: 'simulated', values,
          idempotencyKey: `sim:${pond.sourceId ?? pond.id}:${slot / 1000}`,
        }) });
        posted += 1;
      } catch (e) { failed += 1; log(`  ${pond.name}: ${e.message}`); }
    }
    return { pond: pond.name, posted, failed };
  }

  /**
   * One pass. Returns a summary; throws only if the pond list cannot be fetched (nothing is advanced in that case). A pass can take
   * longer than the check interval (the API is slow during a backfill), so a call made while one is running is skipped, never overlapped.
   */
  let inFlight = null;
  function tick() {
    if (inFlight) return Promise.resolve({ skipped: true, ponds: 0, posted: 0, failed: 0 });
    inFlight = pass().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function pass() {
    const current = +now();
    const { items } = await api('/ponds');
    const active = items.filter((p) => p.dataSource === 'simulator' && p.status === 'active');
    for (const id of [...gens.keys()]) if (!active.some((p) => p.id === id)) gens.delete(id); // switched away: resume fresh if switched back
    const results = await Promise.all(active.map((p) => runPond(p, current).catch((e) => { log(`  ${p.name}: ${e.message}`); return { pond: p.name, posted: 0, failed: 1 }; })));
    return { ponds: active.length, posted: results.reduce((n, x) => n + x.posted, 0), failed: results.reduce((n, x) => n + x.failed, 0) };
  }

  return { tick, intervalMs: slotMs };
}
