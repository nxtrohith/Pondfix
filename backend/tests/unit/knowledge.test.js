import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKnowledgeDocument } from '../../src/services/ai/frontmatter.js';
import { speciesFilter } from '../../src/services/ai/chatbot.js';
import { SPECIES_IDS } from '../../src/services/speciesProfiles.js';
import { chunkText } from '../../src/services/ai/chroma.js';

const doc = (head) => `---\n${head}\n---\n# Title\nBody\n`;
const valid = 'category: species\nspecies: rohu\nreview_status: pending_expert_review';

test('frontmatter yields classification metadata and strips the block from the indexed text', () => {
  const { metadata, body } = parseKnowledgeDocument(doc(`${valid}\ntopic: "rohu_profile"`));
  assert.deepEqual(metadata, { category: 'species', species: 'rohu', review_status: 'pending_expert_review', topic: 'rohu_profile' });
  assert.ok(body.startsWith('# Title') && !body.includes('---'));
});

test('frontmatter rejects missing, unknown, duplicate and invalid values', () => {
  assert.throws(() => parseKnowledgeDocument('# No block'), /Missing frontmatter/);
  assert.throws(() => parseKnowledgeDocument(doc('category: species\nspecies: rohu')), /requires review_status/);
  assert.throws(() => parseKnowledgeDocument(doc(`${valid}\nreviewed_by: me`)), /Unknown frontmatter key/);
  assert.throws(() => parseKnowledgeDocument(doc(`${valid}\ncategory: species`)), /Duplicate/);
  assert.throws(() => parseKnowledgeDocument(doc(valid.replace('species\nspecies', 'recipes\nspecies'))), /Unknown category/);
  assert.throws(() => parseKnowledgeDocument(doc(valid.replace('pending_expert_review', 'approved'))), /review_status/);
  assert.throws(() => parseKnowledgeDocument(doc(valid.replace('rohu', 'Rohu Fish'))), /species must be/);
  assert.throws(() => parseKnowledgeDocument('---\n' + valid + '\n---\n'), /no content/);
});

test('species filter allows general plus configured species and is absent when unconfigured', () => {
  assert.equal(speciesFilter({}), undefined);
  const single = JSON.stringify(speciesFilter({ speciesProfileId: 'rohu' }));
  assert.ok(single.includes('general') && single.includes('rohu'));
  const poly = JSON.stringify(speciesFilter({ speciesComposition: [{ speciesProfileId: 'rohu' }, { speciesProfileId: 'catla' }] }));
  assert.ok(poly.includes('rohu') && poly.includes('catla'));
});

test('every committed knowledge document is classified, within chunk limits, and uses real catalogue species ids', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../knowledge');
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!entry.name.startsWith('_')) await walk(path.join(dir, entry.name)); continue; }
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name.toLowerCase() !== 'readme.md') files.push(path.join(dir, entry.name));
    }
  };
  await walk(root);
  assert.ok(files.length >= 30, `expected a substantial corpus, found ${files.length}`);
  for (const file of files) {
    const label = path.relative(root, file);
    const { metadata, body } = parseKnowledgeDocument(await readFile(file, 'utf8'));
    assert.ok(metadata.species === 'general' || SPECIES_IDS.includes(metadata.species) || ['walking_catfish'].includes(metadata.species), `${label}: unknown species ${metadata.species}`);
    assert.ok(chunkText(body).length <= 2, `${label}: split into more than two chunks; make the document more focused`);
    // The first folder must agree with the category so a misfiled document is caught.
    const folder = label.split('/')[0];
    const expected = { '01_water_quality': 'water_quality', '02_pond_management': 'pond_management', '03_species': 'species', '04_diseases': 'disease', '05_aquaguard_docs': 'aquaguard_docs', '06_farmer_support': 'farmer_support', '07_safety': 'safety' }[folder];
    assert.equal(metadata.category, expected, `${label}: category does not match folder`);
  }
});
