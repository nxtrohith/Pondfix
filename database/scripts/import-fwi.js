// Idempotent historical import of the FWI continuous-monitor CSVs (csv/ara2_*.csv).
//   node scripts/import-fwi.js --dir <csv dir> [--dry-run|--write] [--offline] [--pond ara2_xxxx] [--limit N]
// Default is DRY RUN. Dry run with a configured DB compares against existing documents; --offline skips the DB.
// Never deletes or overwrites: identical existing records are skipped, differing ones are reported as conflicts.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { withDb, run, DB_NAME } from '../lib/connect.js';
import { mapRow, splitLine, fingerprint, pondObjectId, DEMO_USER_ID, DATASET } from '../lib/fwi-mapping.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const BATCH = 1000;

async function* readRows(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header = null; let n = 0;
  for await (const line of rl) {
    n++;
    if (!line.trim()) continue;
    if (!header) { header = splitLine(line); continue; }
    const cells = splitLine(line);
    yield { rowNumber: n, cells, row: Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ''])) , width: header.length };
  }
}

export async function planFile(file, receivedAt, limit = Infinity) {
  const pondSourceId = path.basename(file, '.csv');
  const seen = new Map(); const docs = []; const rejected = [];
  for await (const r of readRows(file)) {
    if (docs.length + rejected.length >= limit) break;
    if (r.cells.length !== r.width) { rejected.push({ file: path.basename(file), rowNumber: r.rowNumber, reason: `expected ${r.width} columns, got ${r.cells.length}` }); continue; }
    const ts = r.row['Date/Time (IST)']?.trim();
    const occurrence = (seen.get(ts) ?? 0) + 1; seen.set(ts, occurrence);
    const out = mapRow({ pondSourceId, file: path.basename(file), rowNumber: r.rowNumber, row: r.row, occurrence, receivedAt });
    if (out.reject) rejected.push({ file: path.basename(file), rowNumber: r.rowNumber, reason: out.reject }); else docs.push(out.doc);
  }
  return { pondSourceId, docs, rejected };
}

async function main() {
  const dir = arg('dir', process.env.FWI_DATA_DIR);
  if (!dir || dir === true) throw new Error('--dir <folder with ara2_*.csv> (or FWI_DATA_DIR) is required');
  const write = process.argv.includes('--write');
  const offline = process.argv.includes('--offline');
  if (write && offline) throw new Error('--write cannot be combined with --offline');
  const only = arg('pond', null); const limit = Number(arg('limit', Infinity));
  const files = fs.readdirSync(dir).filter((f) => /^ara2_[0-9a-f]+\.csv$/.test(f)).filter((f) => !only || f.startsWith(only)).sort().map((f) => path.join(dir, f));
  if (!files.length) throw new Error(`no ara2_*.csv files found in ${dir}`);
  const receivedAt = new Date();
  const totals = { mode: write ? 'WRITE' : 'DRY-RUN', offline, db: offline ? null : DB_NAME, files: files.length, read: 0, inserted: 0, skipped_identical: 0, conflicts: 0, rejected: 0, updated: 0 };
  const perPond = {}; const rejects = []; const conflicts = []; let tMin = null; let tMax = null;

  const exec = async (db) => {
    if (write) {
      await db.collection('users').updateOne({ _id: DEMO_USER_ID }, { $setOnInsert: { _id: DEMO_USER_ID, name: 'AquaGuard Demo Farmer', createdAt: receivedAt, updatedAt: receivedAt } }, { upsert: true });
    }
    for (const file of files) {
      const { pondSourceId, docs, rejected } = await planFile(file, receivedAt, limit);
      const pond = perPond[pondSourceId] = { read: docs.length + rejected.length, rejected: rejected.length, inserted: 0, skipped_identical: 0, conflicts: 0 };
      totals.read += pond.read; totals.rejected += rejected.length; rejects.push(...rejected);
      if (write) {
        await db.collection('ponds').updateOne({ sourceId: pondSourceId }, { $setOnInsert: { _id: pondObjectId(pondSourceId), userId: DEMO_USER_ID, name: pondSourceId, sourceId: pondSourceId, sourceDataset: DATASET, status: 'active', createdAt: receivedAt, updatedAt: receivedAt } }, { upsert: true });
      }
      for (let i = 0; i < docs.length; i += BATCH) {
        const batch = docs.slice(i, i + BATCH);
        for (const d of batch) { if (!tMin || d.recordedAt < tMin) tMin = d.recordedAt; if (!tMax || d.recordedAt > tMax) tMax = d.recordedAt; }
        const existing = new Map();
        if (db) for (const e of await db.collection('measurements').find({ dedupKey: { $in: batch.map((d) => d.dedupKey) } }, { projection: { dedupKey: 1, recordedAt: 1, values: 1 } }).toArray()) existing.set(e.dedupKey, e);
        const fresh = [];
        for (const d of batch) {
          const e = existing.get(d.dedupKey);
          if (!e) fresh.push(d);
          else if (fingerprint(e) === fingerprint(d)) { pond.skipped_identical++; totals.skipped_identical++; }
          else { pond.conflicts++; totals.conflicts++; conflicts.push({ dedupKey: d.dedupKey, existing: fingerprint(e), incoming: fingerprint(d) }); }
        }
        if (!fresh.length) continue;
        if (!write) { pond.inserted += fresh.length; totals.inserted += fresh.length; continue; }
        try {
          const r = await db.collection('measurements').insertMany(fresh, { ordered: false });
          pond.inserted += r.insertedCount; totals.inserted += r.insertedCount;
        } catch (e) {
          if (e?.code !== 11000 && !e?.writeErrors) throw e;
          const ok = e.result?.insertedCount ?? e.insertedCount ?? 0; const dup = fresh.length - ok;
          pond.inserted += ok; totals.inserted += ok; pond.skipped_identical += dup; totals.skipped_identical += dup; // concurrent-insert race
        }
      }
      console.log(`${pondSourceId}: read=${pond.read} new=${pond.inserted} identical=${pond.skipped_identical} conflicts=${pond.conflicts} rejected=${pond.rejected}`);
    }
  };
  if (offline) await exec(null); else await withDb(exec);

  const reportDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const report = { ...totals, ponds: Object.keys(perPond).length, firstRecordedAtUTC: tMin, lastRecordedAtUTC: tMax, perPond, conflictsSample: conflicts.slice(0, 50), rejectedSample: rejects.slice(0, 200) };
  const out = path.join(reportDir, `import-fwi-${totals.mode.toLowerCase()}-${receivedAt.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(totals), `\nrange(UTC): ${tMin?.toISOString()} -> ${tMax?.toISOString()}\nreport: ${out}`);
  if (totals.conflicts) process.exitCode = 2;
}
if (import.meta.url === `file://${process.argv[1]}`) run(main);
