# Testing the alert assistant (Jev + LLM)

The alert assistant watches for new or worsened alerts and adds suggestions to them. It never creates, closes or re-grades an alert: the safety limits still decide that. This guide shows how to trigger it and where every change appears.

## 1. Switch it on (once)

In `backend/.env`:

| Variable | Needed for |
|---|---|
| `TYPESAFE_API_KEY` (or `JEV_API_KEY`) | Jev analysis |
| `LLM_ENDPOINT_URL`, `LLM_API_KEY`, `LLM_MODEL` | The written solution. A base URL such as `https://host/openai/v1` or the full `.../chat/completions` URL both work. |
| `DEMO_ENABLED=true` | Test readings (the Tests page) |
| `ALERT_CALLS_ENABLED=true`, `SARVAM_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID`, `SARVAM_AGENT_ID`, `SARVAM_CONNECTION_ID`, `SARVAM_AGENT_PHONE_NUMBER`, `ALERT_CALL_TO_NUMBER` | Step 6: the Sarvam agent "pondfix" phones the farmer after an observed CRITICAL alert (one call per pond per `ALERT_CALL_COOLDOWN_MINUTES`). **A real phone rings.** |

Then restart the backend (`npm run dev:backend`) and run the database setup once if you have not: `npm run db:init -w database && npm run db:indexes -w database`. Stop the simulator while testing, or it will overwrite the test readings.

## 2. Run the tests (web: **Tests** in the sidebar)

Open `/tests`.

1. **Is everything switched on?** shows four ticks: backend, test readings, Jev, LLM. Fix any cross with the hint beside it.
2. Pick a pond and press **Run this test** on one of:
   * **Critical, several factors**: oxygen 1.5 mg/L, pH 9.4, temperature 36 °C. Expect a priority list (which to fix first), suggested next steps, and a suggested channel.
   * **Critical oxygen only**: one critical alert and a written solution.
   * **Sudden sensor glitch**: three steady readings, then oxygen jumps to 0.4 mg/L alone. Expect the yellow "may be a sensor fault" notice.
3. The **What happened** card ticks off five steps: readings saved, critical alert opened by the limits, Jev analysis, LLM solution, Jev's safety check of the LLM. A yellow step explains why a fallback was used (for example "Standard guidance shown instead: llm failed: LLM_TIMEOUT"). It waits up to 100 seconds.
4. Below the steps are the real alert cards, exactly as the rest of the app shows them, and a **Raw assistant result** you can expand.
5. **Try a field note** saves a note and shows its category, distress chance and seriousness.
6. **Return to normal** posts healthy readings so the test alerts close.

## 3. Where you will see the changes

| Where | What changed |
|---|---|
| Web `/tests` | The new test section described above |
| Web `/alerts` and pond page → "What needs attention?" | A **Suggested priorities and next steps** panel inside each open alert card: priority order, sensor-fault notice, next steps (marked "Written by AI, passed a safety check" or "Standard guidance"), suggested channel, related alerts, and for forecasts "worth acting on now?" |
| Web pond page → **Field notes** | Write notes; each shows a category and a "Possible distress" badge |
| Mobile → alert details | The same advisory panel, below "Recommended action" |
| Mobile → pond details → **Field notes** | Write and list notes (above "Tools") |
| Backend terminal | `[ADVISOR] alert … : jev, first=ph, notify=sms, solution=llm` after each analysis |
| API | `GET /api/alerts` items carry `advisory` and `incidentId`; `GET/POST /api/ponds/:id/notes`; `GET /api/health` has `ai: { advisor, llm }` |
| Database | `alerts.advisory`, `alerts.incidentId`, collection `farmerNotes` |

Analysis takes a few seconds after the alert appears (Jev, then the LLM, then Jev's check). Open alerts refresh by themselves when it finishes.

## 4. What good looks like

* **Several factors**: priorities list has 2 or more rows, critical ones first; solution source is the LLM; the safety check passed.
* **Glitch**: the sensor-fault notice shows. The alert is still open; the notice only asks you to verify the sensor.
* **Fallbacks are normal and visible**: if Jev is down the badge says "Rules only"; if the LLM fails or its answer is blocked the steps say "Standard guidance". The alert itself is never affected.

## 5. If nothing appears

1. Check the four ticks on `/tests`.
2. Watch the backend terminal for `[ADVISOR]` lines; `errors=JEV_HTTP_401` means a bad key, `LLM_HTTP_404` a wrong endpoint, `LLM_TIMEOUT` a slow model (raise `LLM_TIMEOUT_MS`).
3. An alert that is already open at the same severity is not analysed again; use **Return to normal**, then run the test again (the test buttons do this reset for you).
4. Automated checks: `npm test -w backend` (fake Jev and LLM), `npm test -w frontend`.
