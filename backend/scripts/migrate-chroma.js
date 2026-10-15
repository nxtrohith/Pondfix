import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ObjectId } from 'mongodb';
import { withDb, run, sanitize } from '../../database/lib/connect.js';
import { parseKnowledgeDocument } from '../src/services/ai/frontmatter.js';

const HELP = `Usage: npm run chroma:migrate -w backend -- [--write] [--docs DIRECTORY] [--mongo] [--pond-id OBJECTID]

Dry-run by default: validates and counts sources without contacting Chroma.
  --docs DIRECTORY  Recursively read .md/.txt files with a classification frontmatter block
                    (see knowledge/README.md). Directories starting with "_" and README.md are skipped.
  --mongo           Stream farmerNotes and chatTurns from MongoDB (credentials required).
  --pond-id ID      Restrict --mongo to one pond (24 hexadecimal characters).
  --write           Upload sources to Chroma; requires enabled Chroma configuration.
  --help            Show this help.

At least one of --docs or --mongo is required. MongoDB is never modified.`;

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value ?? ''));

async function main() {
  const { values } = parseArgs({
    options: {
      write: { type: 'boolean', default: false },
      docs: { type: 'string' },
      mongo: { type: 'boolean', default: false },
      'pond-id': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) { console.log(HELP); return; }
  if (!values.docs && !values.mongo) throw new Error('Choose --docs DIRECTORY and/or --mongo. Use --help for usage.');
  if (values['pond-id'] !== undefined) {
    if (!isObjectId(values['pond-id'])) throw new Error('--pond-id must be a 24-character hexadecimal ObjectId.');
    if (!values.mongo) throw new Error('--pond-id requires --mongo.');
  }

  const counts = Object.fromEntries(['docs', 'notes', 'chatTurns'].map((kind) => [kind, {
    scanned: 0, planned: 0, indexed: 0, skipped: 0, errors: 0,
  }]));
  let errors = 0;
  let search;
  let scopes;
  let cfg;
  const report = (label, error, kind) => {
    errors++;
    if (kind) counts[kind].errors++;
    // Do not print document contents or connection strings.
    let message = sanitize(error);
    for (const secret of [process.env.CHROMA_API_KEY, process.env.LLM_API_KEY]) {
      if (secret) message = message.split(secret).join('<redacted>');
    }
    console.error(`${label}: ${message}`);
  };
  const processSource = async (kind, label, makeSource) => {
    counts[kind].scanned++;
    try {
      const source = await makeSource();
      if (!source) { counts[kind].skipped++; return; }
      if (values.write) {
        await search.upsert(source);
        counts[kind].indexed++;
      } else {
        counts[kind].planned++;
      }
    } catch (error) { report(label, error, kind); }
  };

  console.log(values.write ? 'WRITE: uploading to Chroma; MongoDB remains read-only.' : 'DRY RUN: no Chroma calls or uploads.');
  try {
    if (values.write) {
      const { loadConfig } = await import('../src/config/index.js');
      cfg = loadConfig().chroma;
      if (!cfg?.enabled || !cfg.apiKey) throw new Error('--write requires CHROMA_ENABLED=true and CHROMA_API_KEY.');
      const { createChromaSearch, ragScopes } = await import('../src/services/ai/chroma.js');
      search = createChromaSearch(cfg);
      scopes = ragScopes;
    }

    if (values.docs) {
      const root = path.resolve(values.docs);
      const walk = async (directory) => {
        let entries;
        try { entries = await readdir(directory, { withFileTypes: true }); }
        catch (error) { report('Read documentation directory', error, 'docs'); return; }
        for (const entry of entries) {
          const filename = path.join(directory, entry.name);
          if (entry.isDirectory()) { if (!entry.name.startsWith('_')) await walk(filename); continue; }
          // Do not follow symlinks outside the explicitly selected tree.
          if (!entry.isFile() || !['.md', '.txt'].includes(path.extname(entry.name).toLowerCase())) continue;
          if (entry.name.toLowerCase() === 'readme.md') continue;
          const relative = path.relative(root, filename).split(path.sep).join('/');
          await processSource('docs', `Document ${relative}`, async () => {
            const raw = await readFile(filename, 'utf8');
            if (!raw.trim()) return null;
            const { metadata, body } = parseKnowledgeDocument(raw);
            return {
              scope: values.write ? scopes(cfg).knowledge : undefined,
              sourceId: `knowledge:${relative}`,
              text: body,
              metadata: { ...metadata, kind: 'knowledge', source: relative },
            };
          });
        }
      };
      try {
        if (!(await stat(root)).isDirectory()) throw new Error('--docs must name a directory.');
        await walk(root);
      } catch (error) { report('Documentation migration', error, 'docs'); }
    }

    if (values.mongo) {
      try {
        await withDb(async (db) => {
          const filter = values['pond-id'] ? { pondId: new ObjectId(values['pond-id']) } : {};
          for (const [collection, kind, field, prefix] of [
            ['farmerNotes', 'notes', 'text', 'note'],
            ['chatTurns', 'chatTurns', 'question', 'chat'],
          ]) {
            // Inclusion projection deliberately excludes generated answers.
            const projection = { _id: 1, pondId: 1, [field]: 1, createdAt: 1 };
            if (kind === 'chatTurns') projection.conversationId = 1;
            const cursor = db.collection(collection).find(filter, { projection }).batchSize(100);
            try {
              for await (const record of cursor) {
                await processSource(kind, `${collection} ${record._id}`, () => {
                  const text = record[field];
                  if (text == null || (typeof text === 'string' && !text.trim())) return null;
                  if (typeof text !== 'string') throw new Error(`${field} must be text.`);
                  if (!isObjectId(record._id) || !isObjectId(record.pondId)) throw new Error('Invalid source or pond ObjectId.');
                  if (!record.createdAt) throw new Error('Missing createdAt.');
                  const createdAt = new Date(record.createdAt).toISOString();
                  const pondId = String(record.pondId);
                  const metadata = { kind: kind === 'notes' ? 'note' : 'conversation', pondId, createdAt };
                  if (kind === 'chatTurns') {
                    if (typeof record.conversationId !== 'string' || !record.conversationId.trim()) throw new Error('Missing conversationId.');
                    metadata.conversationId = record.conversationId;
                  }
                  return {
                    scope: values.write ? scopes(cfg, pondId).memory : undefined,
                    sourceId: `${prefix}:${record._id}`,
                    text,
                    metadata,
                  };
                });
              }
            } catch (error) { report(`Read ${collection}`, error, kind); }
            finally { await cursor.close(); }
          }
        });
      } catch (error) { report('MongoDB migration', error); }
    }
  } catch (error) { report('Migration setup', error); }
  finally {
    console.log(JSON.stringify({ mode: values.write ? 'write' : 'dry-run', counts, errors }));
    if (errors) process.exitCode = 1;
  }
}

run(main);
