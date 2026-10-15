# AquaGuard knowledge library

Versioned, classified source documents for the PondFix/AquaGuard chatbot. Everything here is **pending expert review**. Nothing in this folder is a validated alert limit; the pond's configured limits and alerts always win.

## How the content is classified

| Folder | `category` | What it holds |
| --- | --- | --- |
| `01_water_quality/` | `water_quality` | What each parameter means, why it changes, farmer response |
| `02_pond_management/` | `pond_management` | Stocking, feeding, aeration, exchange, liming, monsoon, algal blooms |
| `03_species/` | `species` | One profile per species (provisional ranges, behaviour, risks) and a compatibility guide |
| `04_diseases/` | `disease` | One record per disease or health problem, using the standard record format |
| `05_aquaguard_docs/` | `aquaguard_docs` | Sensors, alerts, forecasts, stale data, combined risk assessment |
| `06_farmer_support/` | `farmer_support` | FAQ and where to get regional help |
| `07_safety/` | `safety` | Emergency steps, escalation, and what the chatbot must not do |
| `_governance/`, `_templates/` | not indexed | Review workflow, sources, test questions, templates |

Directories starting with `_` and `README.md` files are never indexed.

## Frontmatter (becomes Chroma metadata and search filters)

Every indexed file starts with a flat block. Unknown keys, missing required keys and bad values fail the migration.

```yaml
---
category: species                 # required: see table above
species: rohu                     # required: "general" or ONE pond species id
review_status: pending_expert_review   # required: pending_expert_review | expert_reviewed
topic: rohu_profile               # optional
life_stage: all
region: India
culture_system: earthen_pond
culture_type: freshwater_fish     # or shrimp
species_affected: rohu,catla      # informational only (not a filter)
source_status: citations_unverified
version: 0.1.0
---
```

`species` must match the catalogue ids in `backend/src/services/speciesProfiles.js` (`rohu`, `catla`, `mrigal`, `tilapia`, `pangasius`, `walking_catfish`, `vannamei`, ...). At chat time a pond with a configured species retrieves `general` documents plus its own species; a pond with no species retrieves everything.

## Rules for editing

1. Do not paste a number into a document unless its source and status are stated.
2. Keep each document focused. A document must fit in two chunks (about 16 KB) or the test fails.
3. Change `review_status` to `expert_reviewed` only after a qualified reviewer signs off (see `_governance/review_workflow.md`).
4. After editing: `npm test -w backend`, then the dry run and `--write` commands in `docs/CHROMA_SETUP.md`.

```sh
npm run chroma:migrate -w backend -- --docs /home/rohith/Aquafix/knowledge          # dry run
npm run chroma:migrate -w backend -- --docs /home/rohith/Aquafix/knowledge --write
```
