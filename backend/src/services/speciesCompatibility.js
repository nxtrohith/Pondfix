// Mixed-species (polyculture) compatibility. Source: the project's compatibility matrix; a starting point, not a farm-specific stocking plan.
//   high        : established combination, saved without comment
//   conditional : workable with management; the farmer must acknowledge the stated risk
//   unverified  : not validated for the system, or not in the matrix; the farmer must acknowledge
//   avoid       : blocked (predation risk)
// A walking catfish with another species is `avoid` unless the farmer confirms the other fish are larger (matrix: "larger fish" = conditional).
// Pairs absent from the matrix are `unverified`, never silently accepted. The pond's result is its worst pair.
export const LEVELS = Object.freeze(['high', 'conditional', 'unverified', 'avoid']);
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const CARPS = ['rohu', 'catla', 'mrigal'];
const key = (a, b) => [a, b].sort().join('+');

const PAIRS = new Map([
  ['catla+rohu', ['high', 'Established carp polyculture']],
  ['mrigal+rohu', ['high', 'Different feeding niches']],
  ['catla+mrigal', ['high', 'Surface/column and bottom-feeding habits']],
  ['rohu+tilapia', ['conditional', 'Competition and tilapia reproduction']],
  ['catla+tilapia', ['conditional', 'Food competition and stocking management']],
  ['mrigal+tilapia', ['conditional', 'Bottom habitat, feed and density management']],
  ...CARPS.map((c) => [key('pangasius', c), ['unverified', 'Validate the specific culture system']]),
]);

export function pairCompatibility(a, b) {
  if (a === 'walking_catfish' || b === 'walking_catfish') {
    return { level: 'avoid', reason: 'Predation risk to small fish; allowed only when the other fish are larger (size, aggression and feeding compatibility must be managed)', largerFishOverride: true };
  }
  const hit = PAIRS.get(key(a, b));
  return hit ? { level: hit[0], reason: hit[1] } : { level: 'unverified', reason: 'This combination is not covered by the compatibility matrix' };
}

/** @returns {{level, pairs: {a,b,level,reason}[]}} worst level over all pairs, with every non-high pair listed. */
export function assessComposition(ids, { largerFishConfirmed = false } = {}) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const p = pairCompatibility(ids[i], ids[j]);
    const level = p.largerFishOverride && largerFishConfirmed ? 'conditional' : p.level;
    pairs.push({ a: ids[i], b: ids[j], level, reason: p.reason });
  }
  const level = pairs.reduce((w, p) => (RANK[p.level] > RANK[w] ? p.level : w), 'high');
  return { level, pairs: pairs.filter((p) => p.level !== 'high') };
}

/** Compatibility matrix for clients, so the form can warn before saving. */
export function serializeCompatibility(catalogueIds) {
  const items = [];
  for (let i = 0; i < catalogueIds.length; i++) for (let j = i + 1; j < catalogueIds.length; j++) {
    const a = catalogueIds[i]; const b = catalogueIds[j];
    if (a === 'other' || b === 'other') continue;
    const { level, reason } = pairCompatibility(a, b);
    items.push({ a, b, level, reason });
  }
  return { levels: LEVELS, items, note: 'Starting point for the risk engine, not a substitute for a farm-specific stocking plan. Pairs not in the matrix are unverified.' };
}
