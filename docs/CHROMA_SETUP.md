# Chroma knowledge and pond memory

MongoDB remains the operational store for ponds, farmer notes, and raw chat history (including answers). Chroma is a **rebuildable retrieval index**, not a replacement database. It indexes approved knowledge, farmer notes, and **user questions only**; generated assistant answers are never embedded.

## Configuration

Use Node.js 22+ and the installed backend dependencies (`chromadb`, Chroma Cloud Qwen, and Splade). Put secrets in your private `backend/.env`, or supply them through your deployment's environment. Do not commit keys, paste them into documentation, or expose them in client-side configuration. This setup does not require reading or changing that private file through editor tooling.

For local development, use these supplied Chroma settings:

```dotenv
CHROMA_HOST=api.trychroma.com
CHROMA_TENANT=d6707940-1a08-4abe-ae4d-e7a468c5325a
CHROMA_DATABASE=Demo
CHROMA_SCOPE_ID=single-farmer
CHROMA_ENABLED=true
CHROMA_API_KEY=<your-chroma-cloud-api-key>
CHATBOT_ENABLED=true
```

Copy the API key or environment block from the [Demo database SDK panel](https://www.trychroma.com/sairohith7050/aws-us-east-1/Demo/sdk?tab=env) into your private `backend/.env`. `CHROMA_API_KEY` must authorize the tenant and database above. Keep `CHROMA_SCOPE_ID` stable: knowledge is organization-specific; memory is organization-and-pond-specific. `single-farmer` is a single-organization development scope, not authorization or a multi-tenant ownership check. Only migrate Mongo records belonging to that organization; `--pond-id` can narrow a run to a known pond. Changing the scope or collection prefix selects a different index namespace and requires reindexing. Optional `CHROMA_COLLECTION_PREFIX` and `CHROMA_TIMEOUT_MS` control the collection prefix and request timeout; use the backend configuration's defaults unless you need to override them.

Retain the existing OpenAI-compatible LLM configuration for answer generation:

```dotenv
LLM_ENDPOINT_URL=https://api.groq.com/openai/v1
LLM_API_KEY=<your-existing-groq-api-key>
LLM_MODEL=<your-existing-supported-groq-model>
```

Use a model supported by your Groq account; this guide does not assume that any current backend default is valid for Groq. Gemini is **not** required for embeddings. Qwen and Splade handle retrieval embeddings through Chroma; the answer-generation LLM remains separate.

**Local access:** chat is off by default and can be enabled with `CHATBOT_ENABLED=true` regardless of `NODE_ENV`. Authentication is intentionally not required for this private local project. Anyone who can reach the backend can use chat and access conversation history if they know the pond and conversation IDs; those IDs are not authorization. Set `HOST=127.0.0.1` for same-machine access only. The backend defaults to `0.0.0.0`, which listens on all network interfaces; use that only when access from a trusted LAN device is intended. Do not expose the unauthenticated API through port forwarding or a public tunnel.

## Retrieval and data boundaries

- Organization knowledge and each pond's memory use separate scopes via `ragScopes(cfg, pondId)`; never share memory across ponds or organizations.
- Retrieval combines Qwen dense embeddings with the **retrieval query task** and Splade sparse retrieval, using reciprocal-rank fusion (RRF), weighted **70% Qwen / 30% Splade**. Chroma `GroupBy` on `sourceDocId` groups chunks per source document **within each collection**; it is not global deduplication across collections.
- The shared Chroma service performs line-based, Unicode-safe chunking at 8,000 bytes (below Chroma's 16 KiB document limit), stable chunk IDs, re-embedding on upsert, and stale-tail deletion when a source shrinks. The migration delegates these operations to `upsert()` rather than implementing a separate chunker.
- New notes are indexed automatically when chat is enabled; existing notes need the migration. Farmer-note metadata includes `kind='note'`, `pondId`, and ISO `createdAt`; the indexed text is the note's `text`. Chat-memory metadata includes `kind='conversation'`, `pondId`, `conversationId`, and ISO `createdAt`; the indexed text is only `chatTurns.question`.
- Knowledge metadata includes `kind='knowledge'`, `source` (the filename relative to the explicitly selected docs directory) and the classification fields from each document's frontmatter: `category`, `species`, `review_status`, and optionally `topic`, `culture_type`, `life_stage`, `region`, `version`. At chat time a pond with a configured species (or polyculture) retrieves `species in [general, <its species>]`; a pond with no species retrieves everything. Passages carry `review_status` so the model can tell provisional ranges from reviewed ones. Documents and user text are untrusted reference material, not instructions or validated safety rules.

**Network, privacy, and billing:** write migrations and live indexing upload document text, farmer notes, and user chat memory to Chroma and incur storage/embedding/retrieval costs according to your plan. Groq receives the user request, retrieved chunks, the live pond summary, and recent conversation history to generate an answer. Review provider retention, consent, quotas, and account billing before using real farmer data. Dry-run never calls Chroma, but `--mongo` still makes a real MongoDB connection.

## Migrate approved sources

Run commands from the repository root. Select a dedicated directory containing **approved domain knowledge**: authoritative, reviewed aquaculture guidance with appropriate permissions and provenance. The repository's `knowledge/` folder is a classified starter library (see `knowledge/README.md`) in which **every document is `pending_expert_review`**; treat it as provisional until a qualified reviewer approves it. Each `.md` file needs a frontmatter classification block, and directories starting with `_` plus `README.md` are skipped. Check retrieval with `npm run chroma:eval -w backend`. There is no implicit scan of private repository content, no URL crawling, and **no PDF parser**; supply reviewed `.md` or `.txt` exports yourself. Directory traversal is recursive, case-insensitive for those extensions, and skips nested symlinks. All matching files inside your chosen directory are eligible, including hidden files: do not point this at a repo root, home directory, or secrets directory.

Dry-run is the default and needs no Chroma key:

```sh
# Replace /path/to/approved-knowledge with your explicitly approved directory.
npm run chroma:migrate -w backend -- --docs /path/to/approved-knowledge

# Mongo is opt-in, even if MONGODB_URI is configured.
npm run chroma:migrate -w backend -- --mongo
npm run chroma:migrate -w backend -- --mongo --pond-id 507f1f77bcf86cd799439011

# Inspect both sources together before uploading.
npm run chroma:migrate -w backend -- --docs /path/to/approved-knowledge --mongo
```

A docs-only run does not connect to MongoDB and requires no MongoDB URI. `--mongo` uses `database/lib/connect.js` (`withDb`/`run`), which loads environment configuration and requires real Atlas credentials even in dry-run. `--pond-id` must be a 24-character hexadecimal ObjectId and requires `--mongo`; omitting it scans all ponds in the selected Mongo database. The tool streams Mongo cursors (no whole-collection `toArray`) and reads documentation one file at a time. It never inserts, updates, or deletes Mongo data.

After checking counts and approving the upload:

```sh
npm run chroma:migrate -w backend -- --write --docs /path/to/approved-knowledge
npm run chroma:migrate -w backend -- --write --mongo --pond-id 507f1f77bcf86cd799439011
```

`--write` requires `CHROMA_ENABLED=true` and a valid `CHROMA_API_KEY`; it does not require enabling chat. At least one of `--docs` or `--mongo` is mandatory. `--help` prints usage. The workspace npm command is wired to `backend/scripts/migrate-chroma.js`; the equivalent direct invocation is `node backend/scripts/migrate-chroma.js` followed by the same flags.

The final JSON summary contains `docs`, `notes`, and `chatTurns` counts (`scanned`, `planned`, `indexed`, `skipped`, `errors`) plus a total error count. Counts represent **sources, not chunks**. Empty/missing text is skipped; malformed nonempty records, unreadable files, database failures, and indexing failures are errors. Errors produce a nonzero exit status. Successful writes are not rolled back if another source fails; resolve errors and rerun. Dry-run validates sources and counts planned writes but does not test Chroma credentials, embedding availability, or remote collection compatibility.

Migration source IDs are stable: `knowledge:<relative-filename>`, `note:<Mongo _id>`, and `chat:<Mongo _id>` (one memory source per user turn, not one per whole conversation). Repeating a run in the same scope upserts those sources instead of appending duplicates. Use the same IDs for live indexing. Keep knowledge paths and the chosen root stable; separate roots with identical relative filenames target the same knowledge source. Renames and removed/empty sources are **not** automatically pruned. Stale-tail cleanup applies only when a nonempty source is upserted with fewer chunks; use the service's `deleteSource({scope, sourceId})` for deliberate source deletion or rebuild the affected index. Mongo remains the source of truth.

## Chat API

With chat enabled in local development:

```http
POST /api/ponds/:id/chat
Content-Type: application/json

{"message":"What should I check first?"}
```

Messages are limited to 4,000 characters. The response has `{answer, conversationId, model, sources, memoryIndexed}`. Omit `conversationId` to start a conversation, or send a previously returned **UUID** with the next message:

```json
{"message":"What changed since my last visit?","conversationId":"550e8400-e29b-41d4-a716-446655440000"}
```

`GET /api/ponds/:id/chat/:conversationId` returns recent history for that pond/conversation, not a complete history export. `memoryIndexed` indicates whether this turn's memory indexing succeeded; do not treat an indexing failure as evidence that Mongo history was deleted. `sources` identifies retrieved references, not a guarantee that advice is safe or authoritative. Retrieval and LLM output do not replace validated water-quality rules or expert review.

The implementation adds backend APIs only; no chat UI is included. Retention, conversation deletion, authenticated multi-user access, and request rate limits should be defined before sharing the project beyond its trusted local environment. Splade's configured model is English-oriented; evaluate Telugu and other supported languages separately rather than assuming multilingual sparse retrieval quality.

## Repeatable live smoke test

From the repository root:

```sh
npm run test:chroma:live -w backend
```

This opt-in test requires configured Chroma/LLM credentials and MongoDB Atlas access with permission to create and drop a temporary test database. It sends only synthetic test content to the providers and incurs small embedding/search/LLM charges. It verifies multi-chunk ingestion, Qwen + Splade hybrid retrieval, GroupBy deduplication, unauthenticated HTTP chat, follow-up recall, MongoDB history, and pond-memory isolation. It creates randomly scoped Chroma collections and a separate MongoDB test database, then removes them in cleanup; it never changes existing pond readings or alerts. Cleanup failures are reported, and forcibly terminating the process may leave temporary resources behind.

## Troubleshooting and optional docs tooling

- **Mongo credentials error during docs migration:** omit `--mongo`. Mongo credentials are only needed for the explicitly requested Mongo source.
- **Timeout:** `CHROMA_TIMEOUT_MS` bounds how long the backend waits. The embedding SDK does not expose request cancellation, so timed-out indexing may still finish remotely; retry stable source IDs rather than assuming a timeout rolled back a write.
- **Chroma authentication/collection error:** verify host, tenant, database, key permissions, scope, and compatible collection embedding configuration. Do not log secrets. A dry-run cannot detect remote errors.
- **No knowledge results:** provision approved `.md`/`.txt` documents and run a successful write migration in the same organization scope as the backend. No approved domain corpus is bundled by this setup.
- **Chroma docs MCP URL returns HTTP 405 for GET:** an MCP endpoint is not a normal documentation webpage; use an MCP-compatible client/protocol rather than assuming GET should render docs. This is optional documentation tooling, **not a runtime prerequisite** for the backend or migration. No editor configuration changes are required.
