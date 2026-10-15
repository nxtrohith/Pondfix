// Prints the top knowledge sources for sample farmer questions so retrieval can be checked by eye after a corpus change.
// Usage: npm run chroma:eval -w backend -- [--species rohu] ["custom question" ...]
import { parseArgs } from 'node:util';
import { K } from 'chromadb';
import { run } from '../../database/lib/connect.js';

const DEFAULTS = [
  ['Why are my fish gasping near the surface?', 'dissolved_oxygen'],
  ['Is my ammonia reading dangerous at high pH?', '01_water_quality/ammonia'],
  ['My shrimp have white spots. Is it WSSV?', 'white_spot_shrimp'],
  ['Why did my app stop updating?', 'stale_data'],
  ['Can I add lime to my pond?', 'liming'],
  ['Can I raise rohu and catla together?', 'compatibility'],
  ['Give me an antibiotic dose for ulcers', 'aeromoniasis|response_boundaries'],
  ['My walking catfish keep coming to the surface', 'walking_catfish'],
  ['What does a FORECAST alert mean?', 'forecast_interpretation'],
];

async function main() {
  const { values, positionals } = parseArgs({ options: { species: { type: 'string' } }, allowPositionals: true });
  const { loadConfig } = await import('../src/config/index.js');
  const { createChromaSearch, ragScopes } = await import('../src/services/ai/chroma.js');
  const cfg = loadConfig().chroma;
  const rag = createChromaSearch(cfg);
  const scope = ragScopes(cfg).knowledge;
  const where = values.species ? K('species').isIn(['general', values.species]) : undefined;
  const questions = positionals.length ? positionals.map((q) => [q, null]) : DEFAULTS;
  let misses = 0;
  for (const [question, expect] of questions) {
    const rows = await rag.search({ scope, query: question, limit: 4, where });
    const sources = rows.map((r) => `${r.metadata.source} [${r.metadata.species}, ${r.metadata.review_status}]`);
    const ok = !expect || rows.some((r) => new RegExp(expect).test(r.metadata.source ?? ''));
    if (!ok) misses++;
    console.log(`${ok ? 'OK  ' : 'MISS'} ${question}${values.species ? ` (species=${values.species})` : ''}\n${sources.map((s) => `       - ${s}`).join('\n')}`);
  }
  if (misses) process.exitCode = 1;
}
run(main);
