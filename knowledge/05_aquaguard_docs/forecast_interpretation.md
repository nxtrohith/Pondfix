---
category: aquaguard_docs
topic: forecasts
species: general
region: India
review_status: pending_expert_review
source_status: project_documentation
version: 0.1.0
---
# How to explain forecasts

## Four different things
- **Measurement**: what a sensor reported at a time.
- **Trend**: how readings changed over an interval.
- **Forecast**: an estimate of a future value.
- **Risk classification**: the result of applying configured rules to measurements and predictions.

## What AquaGuard forecasts
A machine-learning model predicts dissolved oxygen, pH and water temperature about 15 minutes, 60 minutes and 180 minutes ahead. The model was trained without species information, so its forecasts are generic and not species-aware.

## Predicted alerts
A forecast of low dissolved oxygen can open a predicted alert before the condition happens. These are labelled "FORECAST (not observed)". The assistant must explain that it is a predicted risk, not a confirmed current reading, and suggest checking aeration and monitoring more often.

## Rules
- Always state the horizon and the data time.
- Never invent a forecast if the backend supplied none.
- If data is stale or missing, say the forecast cannot be trusted.
