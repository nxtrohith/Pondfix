import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { mapRow, parseIstTimestamp, pondObjectId, fingerprint } from '../lib/fwi-mapping.js';
import { requireUri, DB_NAME } from '../lib/connect.js';

const row = (o = {}) => ({ 'Date/Time (IST)': '2025-12-14 02:15:00', 'DO (mg/L)': '5.69', pH: '8.53', 'Temperature (°C)': '25.2', QC_Flag_DateTime: '', QC_Flag_DO: '', QC_Flag_pH: '', ...o });
const map = (o, extra = {}) => mapRow({ pondSourceId: 'ara2_t1', file: 'ara2_t1.csv', rowNumber: 2, row: row(o), receivedAt: new Date('2026-03-01T00:00:00Z'), ...extra });

// ---------------- unit tests (no database) ----------------
test('IST timestamps convert to UTC (-05:30) and the original text is preserved', () => {
  assert.equal(parseIstTimestamp('2025-12-14 02:15:00').toISOString(), '2025-12-13T20:45:00.000Z');
  assert.equal(parseIstTimestamp('2026-01-01 00:00:00').toISOString(), '2025-12-31T18:30:00.000Z');
  assert.equal(parseIstTimestamp('2026-02-30 00:00:00'), null);
  assert.equal(parseIstTimestamp('garbage'), null);
  const { doc } = map({});
  assert.equal(doc.provenance.sourceTimestamp, '2025-12-14 02:15:00'); assert.equal(doc.provenance.sourceTimezone, 'Asia/Kolkata');
  assert.equal(doc.source, 'historical');
});
test('values map to canonical parameters/units; simultaneous source columns stay one observation', () => {
  const { doc } = map({});
  assert.deepEqual(doc.values, [{ parameter: 'dissolved_oxygen', value: 5.69, unit: 'mg/L' }, { parameter: 'ph', value: 8.53, unit: 'pH' }, { parameter: 'temperature', value: 25.2, unit: 'C' }]);
  assert.equal(doc.dedupKey, 'fwi-satellite-campaign-2025-26:ara2_t1:2025-12-14 02:15:00');
  assert.equal(String(doc.pondId), String(pondObjectId('ara2_t1')));
});
test('exact zeros are omitted as documented artifacts; all-zero rows are rejected with a reason; nothing becomes "healthy"', () => {
  const { doc } = map({ 'DO (mg/L)': '0' });
  assert.deepEqual(doc.values.map((v) => v.parameter), ['ph', 'temperature']); assert.deepEqual(doc.provenance.dataQuality, ['zero_value_artifact:do']);
  const r = map({ 'DO (mg/L)': '0', pH: '0', 'Temperature (°C)': '0' }); assert.match(r.reject, /no usable parameter values/);
  assert.match(map({ 'Date/Time (IST)': 'nope' }).reject, /unparseable timestamp/);
  assert.deepEqual(map({ pH: '' }).doc.provenance.dataQuality, ['missing:ph']);
});
test('outliers are kept (with QC flags preserved), not discarded', () => {
  const { doc } = map({ 'DO (mg/L)': '25.56', QC_Flag_DO: 'DO_>10_before_noon; DO_jump_>2', QC_Flag_DateTime: 'time_gap_>20min' });
  assert.equal(doc.values[0].value, 25.56);
  assert.deepEqual(doc.provenance.qcFlags, ['datetime:time_gap_>20min', 'do:DO_>10_before_noon', 'do:DO_jump_>2']);
});
test('repeated timestamps get distinct deterministic keys', () => {
  assert.notEqual(map({}).doc.dedupKey, map({}, { occurrence: 2 }).doc.dedupKey);
  assert.equal(map({}, { occurrence: 2 }).doc.dedupKey.endsWith('#2'), true);
  assert.equal(fingerprint(map({}).doc), fingerprint(map({}).doc));
});

// ---------------- integration: CLI importer + setup scripts against a separate test database on the Atlas cluster ----------------
let uri; let dir; const DB = 'aquaguard_import_test';
if (DB === DB_NAME) throw new Error('the import test database must differ from MONGODB_DB');
const HEADER = 'Date/Time (IST),DO (mg/L),pH,Temperature (°C),QC_Flag_DateTime,QC_Flag_DO,QC_Flag_pH';
// Async on purpose: a blocking spawn would stall the event loop that drains the in-memory mongod's log pipe.
const cli = (script, args = [], env = {}) => new Promise((resolve) => {
  execFile(process.execPath, [path.resolve(import.meta.dirname, '..', 'scripts', script), ...args],
    { encoding: 'utf8', timeout: 120000, env: { PATH: process.env.PATH, MONGODB_URI: uri, MONGODB_DB: DB, ...env } },
    (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, out: stdout + stderr }));
});
before(async () => {
  uri = requireUri();
  const c = new MongoClient(uri); await c.connect(); await c.db(DB).dropDatabase(); await c.close();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fwi-'));
  fs.writeFileSync(path.join(dir, 'ara2_aaaa0001.csv'), [HEADER,
    '2025-12-14 02:15:00,5.69,8.53,25.2,,,', '2025-12-14 02:30:00,0,8.50,25.1,,DO_<0.1,', '2025-12-14 02:45:00,0,0,0,,,',
    '2025-12-14 03:00:00,3.1,8.4,25.0,,,', '2025-12-14 03:00:00,3.3,8.4,25.0,,,', 'not-a-time,1,2,3,,,', '2025-12-14 03:15:00,1,2'].join('\n'));
  fs.writeFileSync(path.join(dir, 'ara2_bbbb0002.csv'), [HEADER, '2025-12-14 02:15:00,6.0,8.0,26.0,,,'].join('\n'));
  fs.writeFileSync(path.join(dir, 'README.md'), 'ignored');
});
after(async () => {
  const c = new MongoClient(uri); await c.connect(); await c.db(DB).dropDatabase(); await c.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('existing setup scripts work end to end: init, indexes, check, seed (rerun-safe), verify', async () => {
  for (const s of ['init-collections.js', 'create-indexes.js', 'init-collections.js', 'create-indexes.js']) assert.equal((await cli(s)).code, 0, s);
  const chk = await cli('check.js'); assert.equal(chk.code, 0, chk.out); assert.match(chk.out, /CHECK PASSED/);
  const s1 = await cli('seed-fixtures.js'); const s2 = await cli('seed-fixtures.js');
  assert.match(s1.out, /measurements: inserted=3/); assert.match(s2.out, /measurements: inserted=0 existing=3/);
  const v = await cli('verify.js'); assert.equal(v.code, 0, v.out); assert.match(v.out, /ALL \d+ CHECKS PASSED/);
  const unseed = await cli('remove-fixtures.js'); assert.match(unseed.out, /dry run/);
  assert.equal((await cli('remove-fixtures.js', ['--confirm'])).code, 0);
});

test('importer: dry run writes nothing; --write imports; rerun is idempotent; conflicts are reported not overwritten', async () => {
  const c = new MongoClient(uri); await c.connect(); const db = c.db(DB);
  try {
    const dry = await cli('import-fwi.js', ['--dir', dir]);
    assert.equal(dry.code, 0, dry.out); assert.match(dry.out, /"mode":"DRY-RUN"/);
    assert.equal(await db.collection('measurements').countDocuments({ source: 'historical' }), 0);
    assert.equal(await db.collection('ponds').countDocuments(), 0);

    const w1 = await cli('import-fwi.js', ['--dir', dir, '--write']); assert.equal(w1.code, 0, w1.out);
    // pond aaaa0001: rows=6 data lines (+1 short row) -> inserted 4 (incl. duplicate-timestamp pair), rejected 3 (all zeros, bad time, short row)
    assert.match(w1.out, /"read":8,"inserted":5,"skipped_identical":0,"conflicts":0,"rejected":3/);
    const M = db.collection('measurements');
    assert.equal(await M.countDocuments({ source: 'historical' }), 5);
    assert.equal(await db.collection('ponds').countDocuments(), 2);
    assert.equal(await db.collection('users').countDocuments(), 1);
    const zero = await M.findOne({ 'provenance.sourceTimestamp': '2025-12-14 02:30:00' });
    assert.deepEqual(zero.values.map((v) => v.parameter), ['ph', 'temperature']);
    assert.equal(zero.recordedAt.toISOString(), '2025-12-13T21:00:00.000Z');
    assert.equal((await M.find({ 'provenance.sourceTimestamp': '2025-12-14 03:00:00' }).toArray()).length, 2, 'duplicate-timestamp observations both kept');
    const pond = await db.collection('ponds').findOne({ sourceId: 'ara2_aaaa0001' });
    assert.equal(String((await M.findOne({ 'provenance.pondSourceId': 'ara2_aaaa0001' })).pondId), String(pond._id));

    const w2 = await cli('import-fwi.js', ['--dir', dir, '--write']); assert.equal(w2.code, 0, w2.out);
    assert.match(w2.out, /"inserted":0,"skipped_identical":5/);
    assert.equal(await M.countDocuments({ source: 'historical' }), 5, 're-import does not change the count');
    assert.equal(await db.collection('ponds').countDocuments(), 2);

    // a changed source value must be reported as a conflict and never overwrite
    fs.writeFileSync(path.join(dir, 'ara2_bbbb0002.csv'), [HEADER, '2025-12-14 02:15:00,6.5,8.0,26.0,,,'].join('\n'));
    const w3 = await cli('import-fwi.js', ['--dir', dir, '--write']); assert.equal(w3.code, 2, w3.out); assert.match(w3.out, /"conflicts":1/);
    assert.equal((await M.findOne({ 'provenance.pondSourceId': 'ara2_bbbb0002' })).values[0].value, 6.0);

    assert.notEqual((await cli('import-fwi.js', ['--dir', dir, '--write', '--offline'])).code, 0, '--write with --offline is refused');
    assert.equal((await cli('import-fwi.js', ['--dir', dir, '--offline'])).code, 0, 'offline dry run needs no database');
  } finally { await c.close(); }
});

test('errors never print the connection URI or password', async () => {
  const r = await cli('ping.js', [], { MONGODB_URI: 'mongodb://user:Sup3rS3cret@ac-fake-00-00.invalid.mongodb.net:27017/?serverSelectionTimeoutMS=500' });
  assert.notEqual(r.code, 0); assert.ok(!r.out.includes('Sup3rS3cret') && !r.out.includes('mongodb://user'), r.out);
});
