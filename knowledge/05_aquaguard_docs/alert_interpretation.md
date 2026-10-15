---
category: aquaguard_docs
topic: alert_interpretation
species: general
region: India
review_status: pending_expert_review
source_status: project_documentation
version: 0.1.0
---
# How to read an AquaGuard alert

An alert is more than a red label. It records what the system saw and the rule it applied.

| Field | Purpose |
| --- | --- |
| Alert id | links to backend logs and support |
| Pond and device | which pond and hardware |
| Parameter | what was measured |
| Reading and unit | the observed value |
| Timestamp and freshness | when it was read, and whether it is current or stale |
| Configured limit | the threshold that applied |
| Risk level | warning or critical |
| Trend | rising, falling or stable |
| Recommended action | a practical next step |
| Confidence and limits | sensor quality and uncertainty |

## General rules versus species limits
Each alert says whether the **general safety rules** or an **approved species policy** was used. Until a domain expert has approved species limits and an operator has supplied them, every species uses the general rules. Species reference ranges shown in the app are context only and never raise an alert.

## Changing a pond's species
Changing a pond's species never edits or closes an existing alert. The next reading is judged by the new setting, and a resolved alert keeps the snapshot it had.

## What the assistant should do
Use the actual reading, unit and configured limit from the pond data. Do not invent a reading or a threshold. Do not claim any particular pond currently has a problem unless the data says so.

## Example wording
"Low oxygen risk detected. The latest valid dissolved-oxygen reading is below this pond's configured warning limit. Start or increase aeration if oxygen depletion is suspected, and verify the reading with a suitable instrument. If fish are gasping or dying, treat it as an emergency."
