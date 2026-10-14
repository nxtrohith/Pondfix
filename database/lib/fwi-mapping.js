// Pure mapping from the FWI continuous-monitor CSV rows to `measurements` documents.
// See imports/FWI_MAPPING.md for the rationale of every rule.
import { createHash } from 'node:crypto';
import { ObjectId } from 'mongodb';

export const DATASET = 'fwi-satellite-campaign-2025-26';
export const SOURCE_TZ = 'Asia/Kolkata'; // "Date/Time (IST)", fixed UTC+05:30, no DST
const IST_OFFSET_MIN = 330;
export const DEMO_USER_ID = new ObjectId('00000000000000000000a001'.slice(0, 24));

export const COLUMNS = {
  ts: 'Date/Time (IST)', do: 'DO (mg/L)', ph: 'pH', temp: 'Temperature (°C)',
  qcTime: 'QC_Flag_DateTime', qcDo: 'QC_Flag_DO', qcPh: 'QC_Flag_pH',
};
const PARAMS = [
  { key: 'do', parameter: 'dissolved_oxygen', unit: 'mg/L', code: 'do' },
  { key: 'ph', parameter: 'ph', unit: 'pH', code: 'ph' },
  { key: 'temp', parameter: 'temperature', unit: 'C', code: 'temp' },
];

/** Deterministic pond _id from the source id so planning works without a database. */
export const pondObjectId = (sourceId) =>
  new ObjectId(createHash('sha1').update(`${DATASET}:${sourceId}`).digest().subarray(0, 12));

/**
 * The 17 continuous-monitor ponds sorted deterministically by source identifier.
 * Matches the 3D layout slots 0..16 and provides friendly display names 'Pond 1' ... 'Pond 17'.
 */
export const POND_SOURCE_IDS = Object.freeze([
  'ara2_0677080b',
  'ara2_0f143c64',
  'ara2_148f1633',
  'ara2_176528d3',
  'ara2_29660d32',
  'ara2_3b2f3973',
  'ara2_3eab831e',
  'ara2_3ed4df8e',
  'ara2_45e1cde5',
  'ara2_4f79fc8d',
  'ara2_573a2826',
  'ara2_6ca69422',
  'ara2_858b914c',
  'ara2_b3d128ac',
  'ara2_c9cdacda',
  'ara2_ca187575',
  'ara2_d52ddb31',
]);

export const POND_NAMES = Object.freeze(
  Object.fromEntries(POND_SOURCE_IDS.map((id, index) => [id, `Pond ${index + 1}`]))
);

export const pondDisplayName = (sourceId, fallback = null) =>
  POND_NAMES[sourceId] ?? fallback ?? sourceId;

export function parseIstTimestamp(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, se) - IST_OFFSET_MIN * 60000;
  const date = new Date(ms);
  // reject impossible calendar dates (e.g. Feb 30 rolls over)
  const back = new Date(ms + IST_OFFSET_MIN * 60000);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d || h > 23 || mi > 59 || se > 59) return null;
  return date;
}

export function splitLine(line) { return line.split(','); }

/**
 * Map one source row. Returns { doc } or { reject: reason }.
 * `occurrence` is the 1-based count of rows seen so far in this file with the same timestamp text.
 */
export function mapRow({ pondSourceId, file, rowNumber, row, occurrence = 1, receivedAt }) {
  const recordedAt = parseIstTimestamp(row[COLUMNS.ts]);
  if (!recordedAt) return { reject: `unparseable timestamp: ${JSON.stringify(row[COLUMNS.ts] ?? null)}` };
  const values = [];
  const dataQuality = [];
  for (const p of PARAMS) {
    const raw = row[COLUMNS[p.key]];
    if (raw === undefined || raw === '') { dataQuality.push(`missing:${p.code}`); continue; }
    const v = Number(raw);
    if (!Number.isFinite(v)) { dataQuality.push(`non_numeric:${p.code}`); continue; }
    // The source documents exact zeros as equipment artifacts (resets/outages), not measurements.
    if (v === 0) { dataQuality.push(`zero_value_artifact:${p.code}`); continue; }
    values.push({ parameter: p.parameter, value: v, unit: p.unit });
  }
  if (values.length === 0) return { reject: `no usable parameter values (${dataQuality.join(', ')})` };
  const qcFlags = [];
  for (const [col, name] of [['qcTime', 'datetime'], ['qcDo', 'do'], ['qcPh', 'ph']]) {
    const f = row[COLUMNS[col]];
    if (f) for (const part of f.split(';')) if (part.trim()) qcFlags.push(`${name}:${part.trim()}`);
  }
  const sourceTimestamp = row[COLUMNS.ts].trim();
  const dedupKey = `${DATASET}:${pondSourceId}:${sourceTimestamp}${occurrence > 1 ? `#${occurrence}` : ''}`;
  return {
    doc: {
      pondId: pondObjectId(pondSourceId), recordedAt, receivedAt, source: 'historical', values,
      provenance: { dataset: DATASET, file, rowNumber, pondSourceId, sourceTimestamp, sourceTimezone: SOURCE_TZ, qcFlags, dataQuality },
      dedupKey, createdAt: receivedAt,
    },
  };
}

/** Canonical form used to tell "identical re-import" from "conflicting record". */
export const fingerprint = (d) => `${+d.recordedAt}|${d.values.map((v) => `${v.parameter}=${v.value}${v.unit}`).join(',')}`;
