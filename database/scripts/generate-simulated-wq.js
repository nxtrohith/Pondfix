// DEMO ONLY: derive simulated ammonia, nitrate and turbidity from the historical FWI readings and store them as separate
// measurements with source "simulated" (never mixed into, or labelled as, historical sensor data).
//   node scripts/generate-simulated-wq.js (--dir <csv dir> | --from-db) [--dry-run|--write] [--offline] [--pond ara2_xxxx] [--limit N]
// --from-db reads the already-imported historical measurements from the database instead of the CSVs.
// Default is DRY RUN. Idempotent: one simulated document per historical row, keyed `sim:<version>:<historical dedupKey>`, never
// overwritten. The historical import must have run first (ponds must exist); rows are derived from the CSVs, not from the database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDb, run, DB_NAME } from '../lib/connect.js';
import { pondObjectId } from '../lib/fwi-mapping.js';
import { createSimulator, SIM_VERSION } from '../lib/wq-simulator.js';
import { planFile } from './import-fwi.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const BATCH = 1000;
const valueOf = (doc, parameter) => doc.values.find((v) => v.parameter === parameter)?.value;

/** Pure: historical docs of one pond -> simulated measurement docs (one per historical row, same instant). */
export function simulateDocs(pondSourceId, historicalDocs, receivedAt) {
  const sim = createSimulator(pondSourceId);
  const ordered = historicalDocs.map((d, i) => ({ d, i })).sort((a, b) => (+a.d.recordedAt - +b.d.recordedAt) || (a.i - b.i)).map((x) => x.d);
  return ordered.map((h) => ({
    pondId: pondObjectId(pondSourceId), recordedAt: h.recordedAt, receivedAt, source: 'simulated',
    values: sim.step({ recordedAt: h.recordedAt, do: valueOf(h, 'dissolved_oxygen'), ph: valueOf(h, 'ph'), temp: valueOf(h, 'temperature') }),
    provenance: { dataset: h.provenance.dataset, file: h.provenance.file, rowNumber: h.provenance.rowNumber, pondSourceId, sourceTimestamp: h.provenance.sourceTimestamp, sourceTimezone: h.provenance.sourceTimezone, simulation: { version: SIM_VERSION, derivedFrom: h.dedupKey } },
    dedupKey: `sim:${SIM_VERSION}:${h.dedupKey}`, createdAt: receivedAt,
  }));
}

async function loadHistorical(db, pondSourceId, limit) {
  const q = db.collection('measurements').find({ pondId: pondObjectId(pondSourceId), source: 'historical', dedupKey: { $exists: true } }).sort({ recordedAt: 1, _id: 1 });
  if (Number.isFinite(limit)) q.limit(limit);
  return { pondSourceId, docs: await q.toArray() };
}

async function main() {
  const fromDb = process.argv.includes('--from-db');
  const dir = arg('dir', process.env.FWI_DATA_DIR);
  if (!fromDb && (!dir || dir === true)) throw new Error('--dir <folder with ara2_*.csv> (or FWI_DATA_DIR), or --from-db, is required');
  if (fromDb && process.argv.includes('--offline')) throw new Error('--from-db needs the database; it cannot be combined with --offline');
  const write = process.argv.includes('--write'); const offline = process.argv.includes('--offline');
  if (write && offline) throw new Error('--write cannot be combined with --offline');
  const only = arg('pond', null); const limit = Number(arg('limit', Infinity));
  const files = fromDb ? [] : fs.readdirSync(dir).filter((f) => /^ara2_[0-9a-f]+\.csv$/.test(f)).filter((f) => !only || f.startsWith(only)).sort().map((f) => path.join(dir, f));
  if (!fromDb && !files.length) throw new Error(`no ara2_*.csv files found in ${dir}`);
  const receivedAt = new Date();
  const totals = { mode: write ? 'WRITE' : 'DRY-RUN', offline, db: offline ? null : DB_NAME, simulationVersion: SIM_VERSION, source: fromDb ? 'database' : 'csv', files: files.length, generated: 0, inserted: 0, skipped_existing: 0, skipped_no_pond: 0 };
  const perPond = {};

  const exec = async (db) => {
    const inputs = fromDb
      ? (await db.collection('ponds').find({ sourceId: { $regex: /^ara2_[0-9a-f]+$/ } }, { projection: { sourceId: 1 } }).sort({ sourceId: 1 }).toArray()).map((p) => p.sourceId).filter((id) => !only || id.startsWith(only))
      : files;
    for (const input of inputs) {
      const { pondSourceId, docs } = fromDb ? await loadHistorical(db, input, limit) : await planFile(input, receivedAt, limit);
      const sims = simulateDocs(pondSourceId, docs, receivedAt);
      const pond = perPond[pondSourceId] = { generated: sims.length, inserted: 0, skipped_existing: 0 };
      totals.generated += sims.length;
      if (db && !(await db.collection('ponds').findOne({ _id: pondObjectId(pondSourceId) }, { projection: { _id: 1 } }))) {
        console.log(`${pondSourceId}: pond not in database, run the historical import first; skipped`);
        totals.skipped_no_pond += 1; pond.skipped_no_pond = true; continue;
      }
      for (let i = 0; i < sims.length; i += BATCH) {
        const batch = sims.slice(i, i + BATCH);
        const existing = db ? new Set((await db.collection('measurements').find({ dedupKey: { $in: batch.map((d) => d.dedupKey) } }, { projection: { dedupKey: 1 } }).toArray()).map((e) => e.dedupKey)) : new Set();
        const fresh = batch.filter((d) => !existing.has(d.dedupKey));
        pond.skipped_existing += batch.length - fresh.length; totals.skipped_existing += batch.length - fresh.length;
        if (!fresh.length) continue;
        if (!write) { pond.inserted += fresh.length; totals.inserted += fresh.length; continue; }
        try {
          const r = await db.collection('measurements').insertMany(fresh, { ordered: false });
          pond.inserted += r.insertedCount; totals.inserted += r.insertedCount;
        } catch (e) {
          if (e?.code !== 11000 && !e?.writeErrors) throw e;
          const ok = e.result?.insertedCount ?? e.insertedCount ?? 0;
          pond.inserted += ok; totals.inserted += ok; pond.skipped_existing += fresh.length - ok; totals.skipped_existing += fresh.length - ok;
        }
      }
      console.log(`${pondSourceId}: generated=${pond.generated} new=${pond.inserted} existing=${pond.skipped_existing}`);
    }
  };
  if (offline) await exec(null); else await withDb(exec);

  const reportDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const out = path.join(reportDir, `simulate-wq-${totals.mode.toLowerCase()}-${receivedAt.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify({ ...totals, perPond }, null, 2));
  console.log(JSON.stringify(totals), `\nreport: ${out}`);
}
if (import.meta.url === `file://${process.argv[1]}`) run(main);
