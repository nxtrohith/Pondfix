---
category: aquaguard_docs
topic: stale_data_connectivity
species: general
region: India
review_status: pending_expert_review
source_status: project_documentation
version: 0.1.0
---
# Stale data and connectivity

A missing reading does not mean the pond is unsafe, and an old reading must not be shown as current.

## Different failure modes
- The device is disconnected from Wi-Fi.
- The device cannot reach the backend.
- The backend is unavailable.
- A sensor reading is missing.
- A reading is invalid or outside the sensor's range.
- The last successful update is older than the freshness limit.
- The farmer's phone is offline.

Example: the pond device can be online while the phone has no internet, or the phone can be online while the pond device is disconnected.

## Checks when the app stops updating
1. Is the phone online? Try another website or app.
2. Is the pond device powered and connected to Wi-Fi?
3. Is the backend reachable?
4. When was the last successful reading?

## Assistant behaviour
Say clearly when live readings are unavailable. Show the last successful reading with its timestamp. Never claim the pond is safe from stale data. For any visible fish distress, do not wait for sensors: treat it as an emergency.
