# Source quality and review workflow

Not indexed. For maintainers.

## Source hierarchy
1. Official fisheries bodies and research institutes: ICAR-CIFA and other ICAR fisheries institutes, state fisheries departments.
2. International technical references: FAO aquaculture manuals, WOAH aquatic animal disease standards, interpreted for the species and region.
3. Peer-reviewed research. Check design and whether findings fit your production system.

## Workflow for every document
1. Collect the original publication and record where it came from.
2. Extract to Markdown, keeping tables, units and context.
3. Technical review of claims, applicability and numbers.
4. Domain approval by a qualified aquaculture or aquatic-animal-health reviewer.
5. Version it: reviewer, approval date, version number.
6. Index approved material (`npm run chroma:migrate`).
7. Test with the questions in `_validation/test_questions.md`.
8. Review again when evidence, regulations or recommendations change.

Do not ingest a whole publication blindly. Older documents may contain doses or limits that should not reach farmers without review. Check copyright and licence before copying extracted text into the product.

## Current status
Every document is `pending_expert_review`, and `source_status: citations_unverified` means the named organisations come from the project brief and the exact documents are not yet recorded. Fill in the document-level source title, URL, date and reviewer before changing a status to `expert_reviewed`.

## Open conflicts to settle
- Mrigal temperature: library 24-31 C, PondFix catalogue 22-32 C.
- Pangasius: exact species not fixed in the catalogue.
- No profile yet for common carp, grass carp or vannamei growth ranges.
- Telugu glossary needs a reviewed translator.
- Alert limits per species stay on the general rules until `AQUAGUARD_SPECIES_POLICIES` is supplied.
