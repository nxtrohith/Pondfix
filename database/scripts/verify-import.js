// Read-only check of imported FWI data against the SOURCE CSVs, using its own minimal parsing (independent of lib/fwi-mapping.js).
//   node scripts/verify-import.js --dir <csv dir> [--sample 200]
import fs from 'node:fs';
import path from 'node:path';
import { withDb, run } from '../lib/connect.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? d : process.argv[i + 1]; };
const dir = arg('dir', process.env.FWI_DATA_DIR); const sample = Number(arg('sample', 200));
if (!dir) { console.error('--dir required'); process.exit(1); }
const istToUtcMs = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - 330 * 60000; };

run(() => withDb(async (db) => {
  const M = db.collection('measurements'); let bad = 0; const fail = (m) => { bad++; if (bad <= 20) console.log('MISMATCH', m); };
  let expectedTotal = 0; let tMin = Infinity; let tMax = -Infinity;
  const files = fs.readdirSync(dir).filter((f) => /^ara2_[0-9a-f]+\.csv$/.test(f)).sort();
  for (const f of files) {
    const id = path.basename(f, '.csv');
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(1).filter((l) => l.trim());
    const rows = lines.map((l) => l.split(','));
    const usable = rows.filter((c) => [c[1], c[2], c[3]].some((v) => v !== '' && Number(v) !== 0));
    const dbCount = await M.countDocuments({ source: 'historical', 'provenance.pondSourceId': id });
    expectedTotal += usable.length;
    if (dbCount !== usable.length) fail(`${id}: db=${dbCount} expected=${usable.length}`);
    const pond = await db.collection('ponds').findOne({ sourceId: id });
    if (!pond) fail(`${id}: pond missing`);
    const wrongPond = await M.countDocuments({ 'provenance.pondSourceId': id, pondId: { $ne: pond?._id } });
    if (wrongPond) fail(`${id}: ${wrongPond} docs reference a different pond`);
    for (const c of usable) { const t = istToUtcMs(c[0]); if (t < tMin) tMin = t; if (t > tMax) tMax = t; }
    // sample rows: exact timestamp + value match (first occurrence of each timestamp text only)
    const seen = new Map(); for (const c of usable) seen.set(c[0], (seen.get(c[0]) ?? 0) + 1);
    const picks = usable.filter((c) => seen.get(c[0]) === 1).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / Math.ceil(sample / files.length))) === 0);
    for (const c of picks) {
      const doc = await M.findOne({ dedupKey: `fwi-satellite-campaign-2025-26:${id}:${c[0]}` });
      if (!doc) { fail(`${id} ${c[0]}: not found`); continue; }
      if (+doc.recordedAt !== istToUtcMs(c[0])) fail(`${id} ${c[0]}: timestamp ${doc.recordedAt.toISOString()}`);
      const got = Object.fromEntries(doc.values.map((v) => [v.parameter, v.value]));
      for (const [i, p] of [[1, 'dissolved_oxygen'], [2, 'ph'], [3, 'temperature']]) {
        const src = c[i] === '' || Number(c[i]) === 0 ? undefined : Number(c[i]);
        if (got[p] !== src) fail(`${id} ${c[0]} ${p}: db=${got[p]} source=${src}`);
      }
      if (doc.source !== 'historical') fail(`${id} ${c[0]}: source=${doc.source}`);
    }
  }
  const totalDb = await M.countDocuments({ source: 'historical', 'provenance.dataset': 'fwi-satellite-campaign-2025-26' });
  const ext = await M.aggregate([{ $match: { source: 'historical' } }, { $group: { _id: null, min: { $min: '$recordedAt' }, max: { $max: '$recordedAt' } } }]).toArray();
  console.log(`ponds=${await db.collection('ponds').countDocuments({ sourceDataset: 'fwi-satellite-campaign-2025-26' })} sourceUsableRows=${expectedTotal} dbHistorical=${totalDb}`);
  console.log(`source range UTC: ${new Date(tMin).toISOString()} -> ${new Date(tMax).toISOString()} | db range: ${ext[0]?.min.toISOString()} -> ${ext[0]?.max.toISOString()}`);
  if (totalDb !== expectedTotal) fail(`total db=${totalDb} expected=${expectedTotal}`);
  console.log(bad ? `VERIFY FAILED: ${bad} mismatch(es)` : 'VERIFY PASSED: counts, pond associations, timestamps and sampled values match the source');
  if (bad) process.exitCode = 1;
}));
