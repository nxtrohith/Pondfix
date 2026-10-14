// Species catalogue, safety-profile status and per-pond rule resolution. The ONLY place species-specific data lives on the backend.
//
// Two different things are kept apart on purpose:
//   reference  : published/preferred ranges shown to the farmer for context. NEVER used to raise an alert.
//   alertPolicy: warning/critical limits approved for automated alerts (same shape as risk.js limits). A profile has one only when
//                an operator supplies it through the AQUAGUARD_SPECIES_POLICIES file after domain-expert review. No policy ships
//                with the code, so out of the box every species uses the general rules in risk.js (and says so).
//
// AQUAGUARD_SPECIES_POLICIES = path to JSON, e.g.
//   { "rohu": { "version": "rohu-2026-11", "approvedBy": "Dr A. Expert", "approvedAt": "2026-11-02", "source": "<document>",
//               "limits": { "do": {"low_warn":4,"low_crit":2.5}, "ph": {...}, "temp": {...} } } }
// `limits` uses the same keys and rules as AQUAGUARD_THRESHOLDS (validated by risk.validateRules). Invalid files stop startup.
import fs from 'node:fs';
import { getActiveRules, validateRules, UNITS } from './risk.js';
import { ApiError, badRequest, validationError } from '../utils/errors.js';
import { assessComposition, serializeCompatibility } from './speciesCompatibility.js';

export const CULTURE_LABEL = Object.freeze({ freshwater_fish: 'Fish', shrimp: 'Shrimp', custom: 'Custom', polyculture: 'Polyculture' });
const BRIEF = 'PondFix project brief (provisional reference range; not independently verified against aquaculture guidance)';
const POND_FISH_PH = { min: 6.5, max: 8.5, kind: 'general_reference', source: BRIEF };
const DO_TARGET = { min: 5, kind: 'operating_target', source: BRIEF };
const temp = (min, max) => ({ min, max, kind: 'preferred_growth_range', source: BRIEF });
const CARP_NOTE = 'Reference ranges are preferred growth conditions, not experimentally established mortality limits.';

const fish = (id, displayName, scientificName, reference, extra = {}) => ({
  id, displayName, scientificName, cultureType: 'freshwater_fish', reference, notes: [CARP_NOTE], ...extra,
});

/** Immutable catalogue. Order is the order shown in the selector. */
export const CATALOGUE = Object.freeze([
  fish('rohu', 'Rohu', 'Labeo rohita', { temperature: temp(24, 31), ph: POND_FISH_PH, dissolved_oxygen: DO_TARGET }),
  fish('catla', 'Catla', 'Catla catla', { temperature: temp(26, 29), ph: POND_FISH_PH, dissolved_oxygen: DO_TARGET }),
  fish('mrigal', 'Mrigal', 'Cirrhinus mrigala', { temperature: temp(22, 32), ph: POND_FISH_PH, dissolved_oxygen: DO_TARGET }),
  {
    id: 'vannamei', displayName: 'Vannamei shrimp', scientificName: 'Litopenaeus vannamei', cultureType: 'shrimp',
    reference: { temperature: temp(28, 32), ph: { min: 7.5, max: 8.5, kind: 'general_reference', source: BRIEF }, dissolved_oxygen: { above: 4, kind: 'operating_target', source: BRIEF }, salinity: null },
    notes: ['Salinity must be configured for the actual culture system; not every vannamei pond runs at marine salinity. PondFix has no salinity sensor, so salinity is not evaluated.', CARP_NOTE],
  },
  fish('tilapia', 'Tilapia', 'Oreochromis niloticus', {}, { notes: ['No reference ranges have been supplied for this species yet.'] }),
  fish('walking_catfish', 'Walking catfish', 'Clarias batrachus', {}, { notes: ['No reference ranges have been supplied for this species yet. Predatory towards small fish.'] }),
  fish('pangasius', 'Pangasius', null, {}, { scientificNameStatus: 'to_be_configured', notes: ['The exact Pangasius species still has to be configured, and no reference ranges have been supplied.'] }),
  fish('common_carp', 'Common carp', 'Cyprinus carpio', {}, { notes: ['No reference ranges have been supplied for this species yet.'] }),
  fish('grass_carp', 'Grass carp', 'Ctenopharyngodon idella', {}, { notes: ['No reference ranges have been supplied for this species yet.'] }),
  { id: 'other', displayName: 'Other / custom', scientificName: null, cultureType: 'custom', reference: {}, custom: true, notes: ['A user-named species. PondFix has no safety profile for it, so only the general rules apply.'] },
]);
const BY_ID = new Map(CATALOGUE.map((s) => [s.id, s]));
export const SPECIES_IDS = Object.freeze(CATALOGUE.map((s) => s.id));
export const getSpecies = (id) => BY_ID.get(id) ?? null;

export class SpeciesPolicyError extends Error {
  constructor(problems) { super(`invalid species policy configuration: ${problems.join('; ')}`); this.name = 'SpeciesPolicyError'; this.problems = problems; }
}
const POLICY_KEYS = { do: 'dissolved_oxygen', ph: 'ph', temp: 'temperature' };
const EMPTY_POLICIES = Object.freeze({ version: null, policies: Object.freeze({}) });

/** Reads and validates the approved-policy file. Returns { version, policies: { speciesId: { version, approvedBy, approvedAt, source, rules } } }. */
export function loadSpeciesPolicies(env = process.env) {
  const file = env.AQUAGUARD_SPECIES_POLICIES;
  if (!file) return EMPTY_POLICIES;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new SpeciesPolicyError([`AQUAGUARD_SPECIES_POLICIES cannot be read as JSON (${e.code || e.name})`]); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SpeciesPolicyError(['file must hold {speciesId: policy}']);
  return buildPolicies(raw);
}

export function buildPolicies(raw) {
  const problems = []; const policies = {};
  for (const [id, p] of Object.entries(raw)) {
    const sp = getSpecies(id);
    if (!sp || sp.custom) { problems.push(`${id}: not a catalogue species that can carry a policy`); continue; }
    if (!p || typeof p !== 'object' || Array.isArray(p)) { problems.push(`${id}: policy must be an object`); continue; }
    for (const k of ['version', 'approvedBy', 'approvedAt', 'source']) if (typeof p[k] !== 'string' || !p[k].trim()) problems.push(`${id}.${k} is required (who approved these limits, when, and from which document)`);
    if (!p.limits || typeof p.limits !== 'object' || Array.isArray(p.limits)) { problems.push(`${id}.limits is required`); continue; }
    const limits = {};
    for (const [k, v] of Object.entries(p.limits)) {
      if (!POLICY_KEYS[k]) { problems.push(`${id}.limits: unsupported parameter ${JSON.stringify(k)} (use do, ph or temp)`); continue; }
      limits[POLICY_KEYS[k]] = v;
    }
    if (!Object.keys(limits).length) problems.push(`${id}.limits defines no parameter`);
    problems.push(...validateRules(limits).map((m) => `${id}: ${m}`));
    if (problems.length) continue;
    policies[id] = Object.freeze({
      version: p.version.trim(), approvedBy: p.approvedBy.trim(), approvedAt: p.approvedAt.trim(), source: p.source.trim(),
      rules: Object.freeze(Object.fromEntries(Object.entries(limits).map(([param, l]) => [param, Object.freeze({ ...l, unit: UNITS[param], enabled: true, source: 'species_policy' })]))),
    });
  }
  if (problems.length) throw new SpeciesPolicyError(problems);
  return Object.freeze({ version: Object.keys(policies).sort().map((i) => `${i}@${policies[i].version}`).join(',') || null, policies: Object.freeze(policies) });
}

let active = EMPTY_POLICIES;
export const setSpeciesPolicies = (set) => { active = set ?? EMPTY_POLICIES; };
export const getSpeciesPolicies = () => active;

/** Legal pond species configuration, read from a pond document. Absent fields mean "unconfigured" (never inferred from id, name or position). */
export function speciesOf(pond) {
  const comp = Array.isArray(pond?.speciesComposition) ? pond.speciesComposition : [];
  if (pond?.cultureType === 'polyculture' && comp.length >= 2) return { mode: 'polyculture', composition: comp };
  if (pond?.speciesProfileId && getSpecies(pond.speciesProfileId)) return { mode: 'single', speciesProfileId: pond.speciesProfileId, customSpeciesName: pond.customSpeciesName };
  return { mode: 'unconfigured' };
}

/** 'validated' = an approved policy exists; 'reference_only' = display ranges but no approved limits; 'not_validated' = nothing. */
export function profileStatus(id) {
  const sp = getSpecies(id);
  if (!sp) return 'not_validated';
  if (active.policies[id]) return 'validated';
  return Object.keys(sp.reference).length ? 'reference_only' : 'not_validated';
}

const STATUS_TEXT = {
  validated: (sp, pol) => `Species-specific alert limits ${pol.version} (approved by ${pol.approvedBy}) apply to the parameters they define; other parameters use the general rules.`,
  reference_only: () => 'Reference ranges only. No approved alert limits exist for this species yet, so the general rules decide alerts.',
  not_validated: () => 'No validated safety profile for this species. The general rules decide alerts; actual readings are still shown.',
};

/** Safe description of the pond's species configuration for API clients. */
export function describeSpecies(pond) {
  const s = speciesOf(pond);
  const configuredAt = pond?.speciesConfiguredAt ?? undefined;
  if (s.mode === 'unconfigured') {
    return { state: 'unconfigured', mode: 'unconfigured', label: 'Species not set', cultureType: null, cultureLabel: null,
      safetyProfile: { status: 'not_validated', alertsEnabled: false, ruleScope: 'general', version: null, message: 'No species has been selected for this pond. The general safety rules apply; select a species to see its reference ranges.' } };
  }
  if (s.mode === 'polyculture') {
    const members = s.composition.map((c) => ({ speciesProfileId: c.speciesProfileId, displayName: getSpecies(c.speciesProfileId)?.displayName ?? c.speciesProfileId, scientificName: getSpecies(c.speciesProfileId)?.scientificName ?? null, ...(c.proportionPercent !== undefined ? { proportionPercent: c.proportionPercent } : {}) }));
    return { state: 'configured', mode: 'polyculture', label: `Polyculture: ${members.map((m) => m.displayName).join(', ')}`, cultureType: 'polyculture', cultureLabel: CULTURE_LABEL.polyculture,
      composition: members, profileVersion: pond.profileVersion, configuredAt,
      safetyProfile: { status: 'not_validated', alertsEnabled: false, ruleScope: 'general', version: null, message: 'Alert limits for mixed-species ponds have not been validated. The general rules decide alerts; each species’ own reference ranges are listed for context.' } };
  }
  const sp = getSpecies(s.speciesProfileId); const pol = active.policies[sp.id];
  const status = profileStatus(sp.id);
  const label = sp.custom ? (s.customSpeciesName || 'Custom species') : sp.displayName;
  return { state: 'configured', mode: 'single', speciesProfileId: sp.id, label, displayName: label, scientificName: sp.scientificName, cultureType: sp.cultureType, cultureLabel: CULTURE_LABEL[sp.cultureType],
    ...(sp.custom ? { customSpeciesName: s.customSpeciesName } : {}), profileVersion: pond.profileVersion, configuredAt,
    safetyProfile: { status, alertsEnabled: status === 'validated', ruleScope: status === 'validated' ? 'species' : 'general', version: pol?.version ?? null, message: STATUS_TEXT[status](sp, pol) } };
}

/**
 * Rule that applies to one parameter of one pond: an approved species policy when there is one and the operator has not disabled the
 * general rule, otherwise the general rule. Never falls back to a DIFFERENT species' policy. Polyculture and custom ponds use general rules.
 */
export function ruleFor(pond, parameter) {
  const general = getActiveRules().rules[parameter];
  const s = speciesOf(pond);
  const pol = s.mode === 'single' ? active.policies[s.speciesProfileId] : undefined;
  const rule = pol?.rules[parameter];
  if (rule && general?.enabled) return { rule, scope: 'species', speciesProfileId: s.speciesProfileId, profileVersion: pol.version };
  return { rule: general, scope: 'general', rulesVersion: getActiveRules().version };
}
export const ruleOfPond = (pond) => (parameter) => ruleFor(pond, parameter).rule;

/** Snapshot stored on an alert, so later species changes never rewrite how that alert was classified. */
export function alertContext(pond, parameter) {
  const r = ruleFor(pond, parameter);
  const d = describeSpecies(pond);
  const ref = { dissolved_oxygen: 'dissolved_oxygen', ph: 'ph', temperature: 'temperature' }[parameter];
  const single = d.mode === 'single' ? getSpecies(d.speciesProfileId) : null;
  const referenceRange = single?.reference[ref] ? { ...single.reference[ref], unit: UNITS[parameter] } : undefined;
  const ctx = {
    ruleScope: r.scope, rulesVersion: r.scope === 'general' ? r.rulesVersion : undefined,
    speciesLabel: d.state === 'configured' ? d.label : undefined, speciesProfileId: d.mode === 'single' ? d.speciesProfileId : undefined,
    profileVersion: r.scope === 'species' ? r.profileVersion : undefined, referenceRange,
  };
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined));
}

// ---- Configuration input (PATCH /ponds/:id/species) ----
const MAX_SPECIES = 6;
const CUSTOM_NAME = /^[\p{L}\p{N} .,'()\-\/]{1,80}$/u;

/**
 * Validates a request body and returns the exact pond fields to $set / $unset. Accepts only:
 *   { mode: 'unconfigured' } | { mode: 'single', speciesProfileId, customSpeciesName? } | { mode: 'polyculture', species: [{ speciesProfileId, proportionPercent? }] }
 */
export function buildSpeciesUpdate(body) {
  const issue = (path, message) => validationError('species configuration is invalid', [{ path, message }]);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('body must be a JSON object');
  const allowed = new Set(['mode', 'speciesProfileId', 'customSpeciesName', 'species', 'acknowledgeWarnings', 'largerFishConfirmed']);
  for (const k of Object.keys(body)) if (!allowed.has(k)) throw issue(k, 'unknown field');
  const ALL = ['cultureType', 'speciesProfileId', 'customSpeciesName', 'speciesComposition', 'profileVersion'];
  const unsetExcept = (keep) => Object.fromEntries(ALL.filter((k) => !keep.includes(k)).map((k) => [k, '']));
  for (const f of ['acknowledgeWarnings', 'largerFishConfirmed']) if (body[f] !== undefined && typeof body[f] !== 'boolean') throw issue(f, 'must be true or false');
  if (body.mode !== 'polyculture') for (const f of ['acknowledgeWarnings', 'largerFishConfirmed']) if (body[f] !== undefined) throw issue(f, 'only applies to a polyculture');
  if (body.mode === 'unconfigured') {
    if (Object.keys(body).length > 1) throw issue('mode', 'unconfigured takes no other fields');
    return { set: {}, unset: { ...unsetExcept([]), speciesConfiguredAt: '' } };
  }
  if (body.mode === 'single') {
    if (body.species !== undefined) throw issue('species', 'not allowed for a single-species pond');
    const sp = typeof body.speciesProfileId === 'string' ? getSpecies(body.speciesProfileId) : null;
    if (!sp) throw issue('speciesProfileId', `must be one of: ${SPECIES_IDS.join(', ')}`);
    const set = { speciesProfileId: sp.id, cultureType: sp.cultureType, profileVersion: profileVersionOf(sp.id) };
    if (sp.custom) {
      const name = typeof body.customSpeciesName === 'string' ? body.customSpeciesName.trim().replace(/\s+/g, ' ') : '';
      if (!name) throw issue('customSpeciesName', 'name the species for an Other / custom pond');
      if (!CUSTOM_NAME.test(name)) throw issue('customSpeciesName', 'use letters, numbers and basic punctuation, up to 80 characters');
      set.customSpeciesName = name;
    } else if (body.customSpeciesName !== undefined) throw issue('customSpeciesName', 'only allowed with the Other / custom species');
    return { set, unset: unsetExcept(Object.keys(set)) };
  }
  if (body.mode === 'polyculture') {
    if (body.speciesProfileId !== undefined || body.customSpeciesName !== undefined) throw issue('mode', 'polyculture uses the species list only');
    const list = body.species;
    if (!Array.isArray(list) || list.length < 2 || list.length > MAX_SPECIES) throw issue('species', `list 2 to ${MAX_SPECIES} species`);
    const seen = new Set(); let withShare = 0; let total = 0;
    const composition = list.map((e, i) => {
      if (!e || typeof e !== 'object' || Array.isArray(e)) throw issue(`species.${i}`, 'must be an object');
      for (const k of Object.keys(e)) if (!['speciesProfileId', 'proportionPercent'].includes(k)) throw issue(`species.${i}.${k}`, 'unknown field');
      const sp = typeof e.speciesProfileId === 'string' ? getSpecies(e.speciesProfileId) : null;
      if (!sp || sp.custom) throw issue(`species.${i}.speciesProfileId`, 'must be a catalogue species (Other / custom is not supported in a polyculture)');
      if (seen.has(sp.id)) throw issue(`species.${i}.speciesProfileId`, 'duplicate species');
      seen.add(sp.id);
      if (e.proportionPercent === undefined) return { speciesProfileId: sp.id };
      if (typeof e.proportionPercent !== 'number' || !Number.isFinite(e.proportionPercent) || e.proportionPercent <= 0 || e.proportionPercent > 100) throw issue(`species.${i}.proportionPercent`, 'must be a number above 0 and at most 100');
      withShare++; total += e.proportionPercent;
      return { speciesProfileId: sp.id, proportionPercent: e.proportionPercent };
    });
    if (withShare !== 0 && withShare !== composition.length) throw issue('species', 'give a proportion for every species or for none; proportions are never assumed');
    if (withShare && Math.abs(total - 100) > 0.01) throw issue('species', `proportions must total 100% (currently ${Math.round(total * 100) / 100}%)`);
    const verdict = assessComposition(composition.map((c) => c.speciesProfileId), { largerFishConfirmed: body.largerFishConfirmed === true });
    const names = (id) => getSpecies(id).displayName;
    const detail = verdict.pairs.map((p) => ({ species: [p.a, p.b], level: p.level, message: `${names(p.a)} + ${names(p.b)}: ${p.reason}` }));
    if (verdict.level === 'avoid') throw new ApiError(422, 'INCOMPATIBLE_SPECIES', 'these species should not be stocked together in one pond', detail.filter((d) => d.level === 'avoid'));
    if (verdict.level !== 'high' && body.acknowledgeWarnings !== true) throw new ApiError(409, 'COMPATIBILITY_ACKNOWLEDGEMENT_REQUIRED', 'this combination is conditional or unverified; review the risks and resend with acknowledgeWarnings: true to save', detail);
    const set = { cultureType: 'polyculture', speciesComposition: composition, profileVersion: composition.map((c) => `${c.speciesProfileId}@${profileVersionOf(c.speciesProfileId)}`).join(',') };
    return { set, unset: unsetExcept(Object.keys(set)) };
  }
  throw issue('mode', 'must be "single", "polyculture" or "unconfigured"');
}

/** Version label of what a species currently resolves to: the approved policy version, or the reference-only marker. */
export function profileVersionOf(id) {
  const pol = active.policies[id];
  return pol ? pol.version : 'reference-only';
}

/** Catalogue entry for GET /species-profiles. */
export function serializeCatalogue() {
  return {
    items: CATALOGUE.map((sp) => {
      const status = profileStatus(sp.id); const pol = active.policies[sp.id];
      return {
        id: sp.id, displayName: sp.displayName, scientificName: sp.scientificName, ...(sp.scientificNameStatus ? { scientificNameStatus: sp.scientificNameStatus } : {}),
        cultureType: sp.cultureType, cultureLabel: CULTURE_LABEL[sp.cultureType], requiresCustomName: !!sp.custom,
        safetyProfile: { status, alertsEnabled: status === 'validated', version: pol?.version ?? null, ...(pol ? { approvedBy: pol.approvedBy, approvedAt: pol.approvedAt, source: pol.source } : {}), message: STATUS_TEXT[status](sp, pol) },
        reference: sp.reference, notes: sp.notes,
      };
    }),
    compatibility: serializeCompatibility(SPECIES_IDS),
    policyVersion: active.version,
    note: 'Reference ranges are provisional context for the farmer. They are not warning or critical limits and never raise an alert by themselves.',
  };
}
