# AquaGuard dashboard — usability & UX plan

Written 12 Oct 2026 after walking through every page of the running dashboard (desktop and 375px mobile) as a first-time user.
Scope: `frontend/` only. No backend, threshold, alert-lifecycle or forecast logic changes — presentation and flow only
(`src/lib/terms.ts` is the single place for wording; keep it that way).

## What a first-time user experiences today

1. **The pages contradict each other.** The Overview headline says "No recent readings from any pond" with a green-ish
   check icon, while the section right below shows a *critical* low-oxygen problem on Pond 5. The bell badge says 1, the
   Alerts page says "Active (0) … No active problems" (the alert is in "Marked as seen"), and the Simulation page promises
   test readings "never describe your real ponds" — yet that simulated reading drives Pond 5's real status card and alert.
   A user cannot tell whether anything is actually wrong.
2. **Too much text, repeated everywhere.** Every pond card repeats "The last reading is not recent, so the current condition
   is not known." Every reading tile repeats "Data is not recent" + "This value is old, so it may not describe the pond now."
   Alert cards carry 8–10 lines (current, level, species, limits used, explanation, state, next step, source). Important
   facts drown.
3. **Jargon and abbreviations.** "DO", "Aggregation", "Limits used: General safety rules", "Safety profile", "demo setting",
   "schematic layout, not a surveyed map", "17 of 17 places in use", UTC timestamps.
4. **No orientation.** Nothing tells a new user what AquaGuard does, what the three numbers mean, what a healthy range is at a
   glance, or what to do first. Empty/stale states explain *why* but not *what to do next*.
5. **Rough edges.**
   - Pond detail browser tab title is `Pond 73653c` (id slice) and breadcrumb says just "Pond" instead of "Pond 5".
   - Pond detail page has a horizontal scrollbar on desktop; "Data is not recent" badges overflow the reading tiles.
   - "Species: Species not set" duplicated wording on pond detail header.
   - 3D farm view captures the mouse wheel, so scrolling the Overview page stops when the cursor is over the map; pond labels
     overlap at default zoom; it shows a blank "Loading the farm view…" box for several seconds.
   - Overview "Refresh" button duplicates the refresh icon already in the top bar.
   - Alerts filters are truncated ("Warning and critic…", "Current and possi…").
   - Simulation → "Test an alert" tab: clicking it did not visibly switch content while the replay panel was loading.
   - All times shown in UTC; farmers think in local time.
   - System status page renders nothing but the shell when loaded (check for a client error).

## Plan (in priority order)

### P0 — Make status truthful and consistent (trust)
- **One source of truth for "is anything wrong".** Overview headline, farm-view chips, pond cards, top-bar bell and Alerts tab
  counts must agree. Rule: if a pond has an open alert (active *or* marked-as-seen), the headline must mention it
  (e.g. "1 pond has a critical problem · 16 have no recent reading"). Never show a check/OK icon while a critical alert is open.
- **Bell badge = Alerts page.** Either the bell counts only Active, or the Alerts page's default view is "Open" (Active + Marked
  as seen). Recommended: rename tabs to **Open / Resolved**, show "seen" as a small tag on the card, and make the bell count
  equal the Open count.
- **Label simulated data unmistakably wherever it appears.** A pond whose latest value came from a simulation gets a visible
  "Test data" tag on its card, tile and alert, and the Overview headline should say e.g. "1 test alert on Pond 5". Fix the
  Simulation page copy so it doesn't promise something the app doesn't do (presentation-only change; don't alter backend).
- **Stale-but-alerting combination.** Pond 5 shows "No recent reading" *and* "critically low" — show the alert first with
  "last measured 30 h ago" rather than two competing statuses.

### P1 — Cut and simplify the words
- Pond cards: status pill + one line max. Drop the repeated stale sentence; show "Last reading 8 months ago" once.
- Reading tiles: one stale indicator per tile (a muted value + "8 months old"), not badge + sentence.
- Alert cards: default to 3 lines — **what** ("Oxygen critically low – 0.20 mg/L"), **where/when** ("Pond 5 · 30 h ago"),
  **what to do** (one-sentence next step). Move species / limits used / explanation / source behind a "Details" disclosure.
- Replace abbreviations in UI: "DO" → "Oxygen"; "Aggregation" → "Detail level"; "Safety profile" → "Alert limits";
  "demo setting" → explain once or hide; drop "schematic layout, not a surveyed map" / "places in use" (move to a tooltip).
- Show times in the browser's local timezone with relative time first ("30 h ago"); keep UTC only in a title/tooltip.
  Update `src/lib/format.ts` and its tests.

### P2 — Orientation & guidance
- **First-run welcome** on Overview (dismissible, remembered in localStorage): 3 bullets — what AquaGuard watches
  (oxygen, pH, temperature), what the colours mean, where to go (Ponds, Alerts, Demo).
- **Healthy-range hint** next to every reading (small bar or "normal 3+ mg/L") so users can judge numbers without reading docs.
- **Actionable empty states**: "No recent readings" → explain likely cause (sensors offline / demo data only) and offer a
  button ("Try the demo" → `/simulation`, "View last known readings").
- Status legend: one consistent colour + icon + word set (Healthy ✓ / Attention ! / Critical !! / No recent reading –) used
  identically on cards, chips, map and alerts. Centralise in `src/lib/status.ts`.

### P3 — Layout & interaction polish
- Pond detail: fix horizontal overflow and badge overflow; `generateMetadata` should use the pond name; breadcrumb "Ponds / Pond 5".
- Reorder pond detail: status + what to do → current readings → trend chart → forecast → species settings → history/details.
- 3D farm view: don't hijack page scroll (enable zoom only with ctrl/⌘+wheel or after click-to-focus); reduce label overlap
  (smaller labels, show only on hover/attention at default zoom); show a static skeleton of pond tiles instead of a blank box.
  Consider collapsing the map under the "Needs attention" section so problems are seen first.
- Remove the duplicate Overview "Refresh" button (top-bar one stays) or vice versa; show "Updated just now" feedback after refresh.
- Alerts filters: widen selects / shorten option labels so nothing truncates; on mobile collapse filters into a "Filter" sheet.
- Simulation: make tab switching immediate (render tab content independently of the replay data load); give each tab a
  one-line "what this does" intro and a clear primary button.
- Fix the System status page render and phrase it for non-engineers ("Everything is working" / what's broken / who to tell).
- Keyboard/a11y pass: visible focus rings, 44px touch targets on mobile, colour contrast on muted text (ink-soft on cream).

## Out of scope
Backend/API changes, risk thresholds, alert lifecycle rules, ML, auth, new pages beyond the welcome panel.

## Done when
- `npm run typecheck -w frontend`, `npm run lint -w frontend`, `npm test -w frontend` all pass (update tests whose copy changed;
  add tests for the headline/bell consistency rule and local-time formatting).
- Manually verified in the browser at desktop width and 375px: no horizontal scroll, no truncated controls, Overview headline,
  bell and Alerts counts agree, simulated data is labelled everywhere.
