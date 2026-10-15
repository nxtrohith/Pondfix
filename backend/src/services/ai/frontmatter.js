// Classification metadata for knowledge documents. A document may start with a flat `key: value` block between `---` lines.
// Only allow-listed keys with allowed values are accepted, so a typo fails the migration instead of silently weakening a filter.
export const CATEGORIES = Object.freeze(['water_quality', 'pond_management', 'species', 'disease', 'aquaguard_docs', 'farmer_support', 'safety']);
export const REVIEW_STATUSES = Object.freeze(['pending_expert_review', 'expert_reviewed']);
const OPTIONAL = ['topic', 'life_stage', 'region', 'culture_system', 'culture_type', 'species_affected', 'source_status', 'language', 'version'];
const REQUIRED = ['category', 'species', 'review_status'];
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL]);
const SPECIES_PATTERN = /^(general|[a-z][a-z0-9_]*)$/;

export function parseKnowledgeDocument(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) throw new Error('Missing frontmatter classification block');
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Invalid frontmatter line: ${line.slice(0, 40)}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    if (!ALLOWED.has(key)) throw new Error(`Unknown frontmatter key: ${key}`);
    if (key in metadata) throw new Error(`Duplicate frontmatter key: ${key}`);
    if (!value || value.length > 200) throw new Error(`Frontmatter value for ${key} must contain 1-200 characters`);
    metadata[key] = value;
  }
  for (const key of REQUIRED) if (!metadata[key]) throw new Error(`Frontmatter requires ${key}`);
  if (!CATEGORIES.includes(metadata.category)) throw new Error(`Unknown category: ${metadata.category}`);
  if (!REVIEW_STATUSES.includes(metadata.review_status)) throw new Error(`Unknown review_status: ${metadata.review_status}`);
  if (!SPECIES_PATTERN.test(metadata.species)) throw new Error('species must be "general" or one catalogue id such as rohu');
  const body = text.slice(match[0].length);
  if (!body.trim()) throw new Error('Document has no content after frontmatter');
  return { metadata, body };
}
