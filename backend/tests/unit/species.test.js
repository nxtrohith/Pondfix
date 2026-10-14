import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, SPECIES_IDS, buildPolicies, buildSpeciesUpdate, describeSpecies, getSpecies, profileStatus, ruleFor, setSpeciesPolicies, serializeCatalogue } from '../../src/services/speciesProfiles.js';
import { classify, loadRiskRules, setActiveRules } from '../../src/services/risk.js';

// TEST FIXTURE ONLY: arbitrary numbers used to exercise the engine. They are not aquaculture guidance and are never shipped.
const FIXTURE = { rohu: { version: 'rohu-test-v1', approvedBy: 'test fixture', approvedAt: '2026-01-01', source: 'unit test', limits: { do: { low_warn: 4, low_crit: 2.5 }, ph: { low_warn: 6.8, low_crit: 6.2, high_warn: 8.2, high_crit: 8.8 } } } };
const withPolicies = (fn) => async () => { setActiveRules(loadRiskRules({})); setSpeciesPolicies(buildPolicies(FIXTURE)); try { await fn(); } finally { setSpeciesPolicies(null); } };
const problems = (body) => { try { buildSpeciesUpdate(body); return null; } catch (e) { return e; } };

test('catalogue: stable ids, display and scientific names kept apart, fish/shrimp labelled', () => {
  assert.deepEqual(SPECIES_IDS, ['rohu', 'catla', 'mrigal', 'vannamei', 'pangasius', 'common_carp', 'grass_carp', 'other']);
  assert.equal(getSpecies('rohu').scientificName, 'Labeo rohita');
  assert.equal(getSpecies('pangasius').scientificName, null);
  assert.equal(getSpecies('pangasius').scientificNameStatus, 'to_be_configured');
  const labels = Object.fromEntries(serializeCatalogue().items.map((s) => [s.id, s.cultureLabel]));
  assert.equal(labels.rohu, 'Fish'); assert.equal(labels.vannamei, 'Shrimp'); assert.equal(labels.other, 'Custom');
});

test('no species ships with approved alert limits: nothing is validated by default', () => {
  setSpeciesPolicies(null);
  for (const s of CATALOGUE) assert.notEqual(profileStatus(s.id), 'validated', s.id);
  assert.equal(profileStatus('rohu'), 'reference_only');
  assert.equal(profileStatus('pangasius'), 'not_validated');
  assert.equal(profileStatus('other'), 'not_validated');
});

test('reference data from the brief is present as context only', () => {
  assert.deepEqual([getSpecies('rohu').reference.temperature.min, getSpecies('rohu').reference.temperature.max], [24, 31]);
  assert.deepEqual([getSpecies('catla').reference.temperature.min, getSpecies('catla').reference.temperature.max], [26, 29]);
  assert.deepEqual([getSpecies('mrigal').reference.temperature.min, getSpecies('mrigal').reference.temperature.max], [22, 32]);
  assert.equal(getSpecies('vannamei').reference.salinity, null, 'salinity is never assumed');
  assert.equal(getSpecies('vannamei').reference.dissolved_oxygen.above, 4);
});

test('buildSpeciesUpdate: single species', () => {
  const u = buildSpeciesUpdate({ mode: 'single', speciesProfileId: 'catla' });
  assert.equal(u.set.speciesProfileId, 'catla'); assert.equal(u.set.cultureType, 'freshwater_fish');
  assert.ok('speciesComposition' in u.unset && !('speciesProfileId' in u.unset));
  assert.equal(problems({ mode: 'single', speciesProfileId: 'Rohu' })?.status, 422, 'display names are not identifiers');
  assert.equal(problems({ mode: 'single', speciesProfileId: 'salmon' })?.status, 422);
  assert.equal(problems({ mode: 'single' })?.status, 422);
  assert.equal(problems({ mode: 'single', speciesProfileId: 'rohu', extra: 1 })?.status, 422);
  assert.equal(problems({ mode: 'single', speciesProfileId: 'rohu', customSpeciesName: 'x' })?.status, 422);
  assert.equal(problems({ speciesProfileId: 'rohu' })?.status, 422, 'mode is required');
  assert.equal(problems(null)?.status, 400);
});

test('buildSpeciesUpdate: other / custom needs a clean name', () => {
  assert.equal(problems({ mode: 'single', speciesProfileId: 'other' })?.status, 422);
  assert.equal(problems({ mode: 'single', speciesProfileId: 'other', customSpeciesName: '   ' })?.status, 422);
  assert.equal(problems({ mode: 'single', speciesProfileId: 'other', customSpeciesName: '<script>' })?.status, 422);
  assert.equal(buildSpeciesUpdate({ mode: 'single', speciesProfileId: 'other', customSpeciesName: '  Tilapia   (GIFT) ' }).set.customSpeciesName, 'Tilapia (GIFT)');
});

test('buildSpeciesUpdate: polyculture proportions are validated, never assumed', () => {
  const ok = buildSpeciesUpdate({ mode: 'polyculture', species: [{ speciesProfileId: 'rohu', proportionPercent: 60 }, { speciesProfileId: 'catla', proportionPercent: 40 }] });
  assert.equal(ok.set.cultureType, 'polyculture'); assert.equal(ok.set.speciesComposition.length, 2);
  assert.ok(!ok.set.speciesComposition.some((c) => 'proportionPercent' in c) === false);
  const none = buildSpeciesUpdate({ mode: 'polyculture', species: [{ speciesProfileId: 'rohu' }, { speciesProfileId: 'mrigal' }] });
  assert.ok(none.set.speciesComposition.every((c) => !('proportionPercent' in c)), 'no proportions are invented');
  const bad = (species) => problems({ mode: 'polyculture', species })?.status;
  assert.equal(bad([{ speciesProfileId: 'rohu', proportionPercent: 60 }, { speciesProfileId: 'catla', proportionPercent: 30 }]), 422, 'must total 100');
  assert.equal(bad([{ speciesProfileId: 'rohu', proportionPercent: 60 }, { speciesProfileId: 'catla' }]), 422, 'all or none');
  assert.equal(bad([{ speciesProfileId: 'rohu' }, { speciesProfileId: 'rohu' }]), 422, 'duplicate');
  assert.equal(bad([{ speciesProfileId: 'rohu' }]), 422, 'needs at least two');
  assert.equal(bad([{ speciesProfileId: 'rohu' }, { speciesProfileId: 'other' }]), 422, 'custom not allowed');
  assert.equal(bad([{ speciesProfileId: 'rohu', proportionPercent: -5 }, { speciesProfileId: 'catla', proportionPercent: 105 }]), 422);
  assert.equal(bad([{ speciesProfileId: 'rohu', proportionPercent: 'half' }, { speciesProfileId: 'catla', proportionPercent: 50 }]), 422);
});

test('buildSpeciesUpdate: unconfigured clears every species field', () => {
  const u = buildSpeciesUpdate({ mode: 'unconfigured' });
  assert.deepEqual(u.set, {}); for (const k of ['speciesProfileId', 'cultureType', 'speciesComposition', 'customSpeciesName', 'profileVersion', 'speciesConfiguredAt']) assert.ok(k in u.unset, k);
  assert.equal(problems({ mode: 'unconfigured', speciesProfileId: 'rohu' })?.status, 422);
});

test('buildPolicies: approval metadata and valid limits are required, only catalogue species', () => {
  const bad = (raw) => { try { buildPolicies(raw); return null; } catch (e) { return e.problems; } };
  assert.ok(bad({ salmon: FIXTURE.rohu }));
  assert.ok(bad({ other: FIXTURE.rohu }));
  assert.ok(bad({ rohu: { ...FIXTURE.rohu, approvedBy: '' } }));
  assert.ok(bad({ rohu: { ...FIXTURE.rohu, limits: { do: { low_warn: 2, low_crit: 3 } } } }), 'inverted limits');
  assert.ok(bad({ rohu: { ...FIXTURE.rohu, limits: { salinity: { low_warn: 1, low_crit: 0 } } } }), 'unsupported parameter');
  assert.ok(bad({ rohu: { ...FIXTURE.rohu, limits: {} } }));
  assert.equal(buildPolicies(FIXTURE).policies.rohu.rules.dissolved_oxygen.low_warn, 4);
});

test('ruleFor: only a species with an approved policy gets species rules; others use general rules', withPolicies(() => {
  assert.equal(ruleFor({ speciesProfileId: 'rohu' }, 'dissolved_oxygen').scope, 'species');
  assert.equal(ruleFor({ speciesProfileId: 'rohu' }, 'temperature').scope, 'general', 'parameters the policy omits keep the general rule');
  assert.equal(ruleFor({ speciesProfileId: 'catla' }, 'dissolved_oxygen').scope, 'general', 'never borrows another species profile');
  assert.equal(ruleFor({ speciesProfileId: 'other', customSpeciesName: 'x' }, 'dissolved_oxygen').scope, 'general');
  assert.equal(ruleFor({}, 'dissolved_oxygen').scope, 'general', 'unconfigured');
  assert.equal(ruleFor({ cultureType: 'polyculture', speciesComposition: [{ speciesProfileId: 'rohu' }, { speciesProfileId: 'catla' }] }, 'dissolved_oxygen').scope, 'general');
  assert.equal(ruleFor({ speciesProfileId: 'bogus' }, 'dissolved_oxygen').scope, 'general', 'unknown stored id is treated as unconfigured');
}));

test('species rule boundaries are deterministic: on the limit is normal, strictly beyond is an excursion', withPolicies(() => {
  const rule = ruleFor({ speciesProfileId: 'rohu' }, 'dissolved_oxygen').rule;
  assert.equal(classify('dissolved_oxygen', 4, rule).status, 'NORMAL');
  assert.equal(classify('dissolved_oxygen', 3.999, rule).status, 'WARNING');
  assert.equal(classify('dissolved_oxygen', 2.5, rule).status, 'WARNING');
  assert.equal(classify('dissolved_oxygen', 2.499, rule).status, 'CRITICAL');
  assert.equal(classify('dissolved_oxygen', NaN, rule).status, 'UNKNOWN');
  assert.equal(classify('dissolved_oxygen', 3.5).status, 'NORMAL', 'the general rule is unchanged');
}));

test('operator-disabled general rule is not re-enabled by a species policy', withPolicies(() => {
  setActiveRules(loadRiskRules({ RISK_RULES_DISABLED: 'dissolved_oxygen' }));
  const r = ruleFor({ speciesProfileId: 'rohu' }, 'dissolved_oxygen');
  assert.equal(r.scope, 'general'); assert.equal(classify('dissolved_oxygen', 1, r.rule).status, 'UNKNOWN');
  setActiveRules(loadRiskRules({}));
}));

test('describeSpecies: unconfigured, unvalidated and validated states are explicit', withPolicies(() => {
  assert.equal(describeSpecies({}).state, 'unconfigured');
  assert.equal(describeSpecies({}).safetyProfile.ruleScope, 'general');
  const catla = describeSpecies({ speciesProfileId: 'catla', cultureType: 'freshwater_fish' });
  assert.deepEqual([catla.safetyProfile.status, catla.safetyProfile.alertsEnabled], ['reference_only', false]);
  const rohu = describeSpecies({ speciesProfileId: 'rohu' });
  assert.deepEqual([rohu.safetyProfile.status, rohu.safetyProfile.alertsEnabled, rohu.safetyProfile.version], ['validated', true, 'rohu-test-v1']);
  assert.equal(describeSpecies({ speciesProfileId: 'other', customSpeciesName: 'Tilapia' }).label, 'Tilapia');
  assert.equal(describeSpecies({ speciesProfileId: 'other', customSpeciesName: 'Tilapia' }).safetyProfile.status, 'not_validated');
}));

test('every catalogue species that is given an approved policy uses exactly its own configured rules', () => {
  const raw = Object.fromEntries(CATALOGUE.filter((s) => !s.custom).map((s, i) => [s.id, { ...FIXTURE.rohu, version: `${s.id}-t`, limits: { do: { low_warn: 3.5 + i / 10, low_crit: 2 } } }]));
  setSpeciesPolicies(buildPolicies(raw));
  try {
    CATALOGUE.filter((s) => !s.custom).forEach((s, i) => {
      const r = ruleFor({ speciesProfileId: s.id }, 'dissolved_oxygen');
      assert.deepEqual([r.scope, r.profileVersion, r.rule.low_warn], ['species', `${s.id}-t`, 3.5 + i / 10], s.id);
    });
  } finally { setSpeciesPolicies(null); }
});

test('an invalid species policy file stops startup instead of being ignored', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { loadConfig } = await import('../../src/config/index.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aq-pol-')); const f = path.join(dir, 'p.json');
  try {
    fs.writeFileSync(f, JSON.stringify({ rohu: { version: 'v' } }));
    assert.throws(() => loadConfig({ AQUAGUARD_SPECIES_POLICIES: f }), /invalid species policy configuration/);
    fs.writeFileSync(f, '{nope');
    assert.throws(() => loadConfig({ AQUAGUARD_SPECIES_POLICIES: f }), /cannot be read as JSON/);
    assert.equal(loadConfig({}).speciesPolicies.version, null, 'no file: no species is validated');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
