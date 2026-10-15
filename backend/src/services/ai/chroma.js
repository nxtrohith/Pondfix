import { createHash } from 'node:crypto';
import { CloudClient, Schema, VectorIndexConfig, SparseVectorIndexConfig, Search, K, Knn, Rrf, GroupBy, MinK } from 'chromadb';
import { ChromaCloudQwenEmbeddingFunction, ChromaCloudQwenEmbeddingModel } from '@chroma-core/chroma-cloud-qwen';
import { ChromaCloudSpladeEmbeddingFunction } from '@chroma-core/chroma-cloud-splade';
import { ApiError } from '../../utils/errors.js';

const hash = (text) => createHash('sha256').update(text).digest('hex');
export const CHUNK_BYTES = 8000; // Below Chroma's 16 KiB document limit, including multibyte text.

export function ragScopes(cfg, pondId) {
  return {
    knowledge: JSON.stringify([cfg.scopeId, 'knowledge']),
    ...(pondId ? { memory: JSON.stringify([cfg.scopeId, 'pond', String(pondId)]) } : {}),
  };
}

// Preserve line boundaries when possible; split oversized lines on Unicode code points.
export function chunkText(text, maxBytes = CHUNK_BYTES) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Document must contain text');
  if (!Number.isInteger(maxBytes) || maxBytes < 4 || maxBytes > 16384) throw new Error('Invalid chunk byte limit');
  const chunks = [];
  let current = '';
  let bytes = 0;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const lineBytes = Buffer.byteLength(line);
    if (current && bytes + lineBytes > maxBytes) { chunks.push(current); current = ''; bytes = 0; }
    if (lineBytes <= maxBytes) { current += line; bytes += lineBytes; continue; }
    for (const char of line) {
      const size = Buffer.byteLength(char);
      if (bytes + size > maxBytes) { chunks.push(current); current = ''; bytes = 0; }
      current += char; bytes += size;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function hybridSearch(query, { where, limit = 6 } = {}) {
  let search = new Search()
    .rank(Rrf({ ranks: [
      Knn({ query, key: K.EMBEDDING, returnRank: true, limit: 100, default: 1000 }),
      Knn({ query, key: 'sparse_embedding', returnRank: true, limit: 100, default: 1000 }),
    ], weights: [0.7, 0.3], k: 60 }))
    .groupBy(new GroupBy([K('sourceDocId')], new MinK([K.SCORE], 1)))
    .limit(limit)
    .select(K.DOCUMENT, K.SCORE, 'sourceDocId', 'chunkIndex', 'source', 'kind', 'createdAt',
          'category', 'topic', 'species', 'review_status', 'source_status', 'culture_type', 'version');
  if (where) search = search.where(where);
  return search;
}

export function createChromaSearch(cfg, { client = null } = {}) {
  if (!cfg.enabled || !cfg.apiKey) throw new ApiError(503, 'CHROMA_DISABLED', 'Configure Chroma Cloud before using search');
  client ??= new CloudClient({ apiKey: cfg.apiKey, tenant: cfg.tenant, database: cfg.database, host: cfg.host });
  const dense = new ChromaCloudQwenEmbeddingFunction({
    model: ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
    task: 'retrieval',
    instructions: { retrieval: { documents: '', query: 'Given an aquaculture question, retrieve relevant passages or farmer observations that help answer it.' } },
    client,
  });
  const sparse = new ChromaCloudSpladeEmbeddingFunction({ client });
  const schema = new Schema()
    .createIndex(new VectorIndexConfig({ space: 'cosine', embeddingFunction: dense }))
    .createIndex(new SparseVectorIndexConfig({ sourceKey: K.DOCUMENT, embeddingFunction: sparse }), 'sparse_embedding');

  // Bound caller wait time. The embedding SDK does not expose request cancellation.
  async function bounded(fn) {
    let timer;
    try {
      return await Promise.race([fn(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Chroma timeout')), cfg.timeoutMs);
      })]);
    } catch {
      throw new ApiError(503, 'CHROMA_UNAVAILABLE', 'Chroma search/indexing failed; check credentials, quota and service availability');
    } finally { clearTimeout(timer); }
  }
  // Do not cache handles indefinitely: this single-farmer service may see many ponds.
  function collection(scope) {
    if (typeof scope !== 'string' || !scope) throw new Error('Search scope is required');
    return client.getOrCreateCollection({ name: `${cfg.prefix}-${hash(scope)}`, schema });
  }

  async function upsert({ scope, sourceId, text, metadata = {} }) {
    if (typeof sourceId !== 'string' || !sourceId) throw new Error('Source document ID is required');
    const chunks = chunkText(text);
    return bounded(async () => {
      const col = await collection(scope);
      for (let offset = 0; offset < chunks.length; offset += 32) {
        const batch = chunks.slice(offset, offset + 32);
        await col.upsert({
          ids: batch.map((_, i) => `${hash(sourceId)}:${offset + i}`),
          documents: batch,
          metadatas: batch.map((_, i) => ({ ...metadata, sourceDocId: sourceId, chunkIndex: offset + i })),
        });
      }
      // Delete old tail chunks only AFTER the replacement has been embedded successfully.
      await col.delete({ where: { $and: [{ sourceDocId: sourceId }, { chunkIndex: { $gte: chunks.length } }] } });
      return { chunks: chunks.length };
    });
  }
  async function search({ scope, query, where, limit = 6 }) {
    if (typeof query !== 'string' || !query.trim() || query.length > 4000) throw new Error('Search query must contain 1–4000 characters');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Search limit must be between 1 and 20');
    return bounded(async () => {
      const col = await collection(scope);
      const result = await col.search(hybridSearch(query, { where, limit }));
      return result.rows()[0] ?? [];
    });
  }
  async function deleteSource({ scope, sourceId }) {
    if (typeof sourceId !== 'string' || !sourceId) throw new Error('Source document ID is required');
    return bounded(async () => (await collection(scope)).delete({ where: { sourceDocId: sourceId } }));
  }
  return { upsert, search, deleteSource };
}
