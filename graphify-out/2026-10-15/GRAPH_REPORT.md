# Graph Report - Aquafix  (2026-10-14)

## Corpus Check
- 356 files · ~228,047 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: (none) 4, .example 3, .pkl 1)

## Summary
- 2397 nodes · 7304 edges · 111 communities (99 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Web Pond Detail Page
- Mobile Alert & Login Screens
- Web Trend Charts
- Web Pond Panel & Advisor Lab
- Mobile Forecast & Pond Detail
- Web Farm Twin View
- Web Alerts & Analytics Pages
- Mobile Diagnostics & Layout
- Web Comparison Tables
- Pond Badge & Alert Demo
- Backend Realtime & Alert Bus
- Sensor Badge & Mock Species
- Backend Config Loader
- Demo Pond Test Helpers
- Alert Advisory & Downstream Risks
- Web Root Layout
- Anomaly Simulator
- Vision App Dependencies
- AI Advisor Core
- Backend REST Routes
- FWI Dataset Mapping
- Vision Logger
- Advisor & Alert Events
- 3D Farm Scene
- Mobile Providers & Ponds Data
- Mobile Realtime Client
- Mobile App Dependencies
- Farm Fallback & Layout
- Historical Replay
- Backend Dependencies
- ML Python Worker
- Vision Main Screen
- Backend Analytics Queries
- Test Fixtures
- Database Connect & Indexes
- Frontend Dependencies
- Farm Demo Data
- What-If Simulation Form
- Replay Tests
- Mobile Alert Detail & Notifications
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 110

## God Nodes (most connected - your core abstractions)
1. `cx()` - 61 edges
2. `Card()` - 53 edges
3. `colors` - 47 edges
4. `formatDateTime()` - 42 edges
5. `ErrorState()` - 41 edges
6. `buildRouter()` - 40 edges
7. `AppButton()` - 39 edges
8. `ScreenContainer()` - 39 edges
9. `fontSize` - 39 edges
10. `HistoricalReplay()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Expo agent rules (use versioned docs, Expo Router)` --semantically_similar_to--> `Next.js agent rules (read bundled docs first)`  [INFERRED] [semantically similar]
  mobile-app/AGENTS.md → frontend/AGENTS.md
- `mk()` --indirect_call--> `T()`  [INFERRED]
  frontend/tests/alerts-multi.test.tsx → mobile-app/tests/unit/liveData.test.tsx
- `pred()` --indirect_call--> `T()`  [INFERRED]
  frontend/tests/plain-language.test.tsx → mobile-app/tests/unit/liveData.test.tsx
- `PondFix Vision fish activity monitor` --conceptually_related_to--> `PondFix system`  [INFERRED]
  aquaguard-vision/README.md → README.md
- `Simulation historical replay` --conceptually_related_to--> `Historical replay (FWI data)`  [INFERRED]
  frontend/README.md → README.md

## Import Cycles
- 3-file cycle: `backend/src/services/alertEvents.js -> backend/src/services/queries.js -> backend/src/services/ingestion.js -> backend/src/services/alertEvents.js`
- 3-file cycle: `backend/src/services/ingestion.js -> backend/src/services/pondSync.js -> backend/src/services/queries.js -> backend/src/services/ingestion.js`
- 4-file cycle: `backend/src/services/alertEvents.js -> backend/src/services/queries.js -> backend/src/services/ingestion.js -> backend/src/services/inference.js -> backend/src/services/alertEvents.js`

## Hyperedges (group relationships)
- **Measurement to alert flow** — readme_measurement_pipeline, readme_risk_rules, readme_alert_lifecycle, backend_readme_advisor [INFERRED 0.85]
- **PondFix client apps on shared API** — readme_frontend, readme_mobile, readme_rest_api [EXTRACTED 1.00]

## Communities (111 total, 12 thin omitted)

### Community 0 - "Web Pond Detail Page"
Cohesion: 0.07
Nodes (65): dynamic, generateMetadata(), PondDetailPage(), Section(), PondTooltip(), AlertCard(), AlertCardList(), EDGE (+57 more)

### Community 1 - "Mobile Alert & Login Screens"
Cohesion: 0.10
Nodes (66): AlertDetailScreen(), DiagnosticsScreen(), SplashScreen(), LoginScreen(), styles, NotificationsScreen(), ChartsScreen(), styles (+58 more)

### Community 2 - "Web Trend Charts"
Cohesion: 0.07
Nodes (70): ChartTooltip(), Props, Series, SERIES_COLOR, Threshold, TipProps, TONE, TrendChart() (+62 more)

### Community 3 - "Web Pond Panel & Advisor Lab"
Cohesion: 0.08
Nodes (46): NotFound(), PARAMS, PondPanel(), AdvisorTestLab(), start(), NORMAL, NoteTest(), Phase (+38 more)

### Community 4 - "Mobile Forecast & Pond Detail"
Cohesion: 0.09
Nodes (52): HorizonKey, HORIZONS, styles, styles, ToolLink(), SENSOR_NAME, styles, ChartCard() (+44 more)

### Community 5 - "Web Farm Twin View"
Cohesion: 0.03
Nodes (65): FarmTwinProps, Filter, LEGEND, noopSubscribe(), SWATCH, useWebgl(), webglAvailable(), Run (+57 more)

### Community 6 - "Web Alerts & Analytics Pages"
Cohesion: 0.09
Nodes (49): AlertsPage(), dynamic, metadata, AnalyticsPage(), dynamic, metadata, RouteError(), dbLabel() (+41 more)

### Community 7 - "Mobile Diagnostics & Layout"
Cohesion: 0.07
Nodes (42): STATUS_TEXT, styles, styles, styles, TopLevelTabsLayout(), Props, styles, Variant (+34 more)

### Community 8 - "Web Comparison Tables"
Cohesion: 0.07
Nodes (49): CellStatus(), Legend(), OverallList(), QualityTable(), styles, Tab, save(), Props (+41 more)

### Community 9 - "Pond Badge & Alert Demo"
Cohesion: 0.08
Nodes (43): MARK, PondBadge(), ACTION_LABEL, AlertDemoRunner(), execute(), refreshAlerts(), start(), blank() (+35 more)

### Community 10 - "Backend Realtime & Alert Bus"
Cohesion: 0.08
Nodes (22): attachRealtime(), createAlertBus(), DEMO_POND_ID, doReading(), startEnv(), TEST_DB, critical(), fakeJev (+14 more)

### Community 11 - "Sensor Badge & Mock Species"
Cohesion: 0.10
Nodes (30): PRESENTATION, SensorBadge(), styles, SPECIES, speciesById(), fleetCounts, summarizePond(), SensorConnection (+22 more)

### Community 12 - "Backend Config Loader"
Cohesion: 0.10
Nodes (32): aiConfig(), httpUrl(), loadConfig(), buildFacts(), loadRiskRules(), RuleConfigError, setActiveRules(), validateRules() (+24 more)

### Community 13 - "Demo Pond Test Helpers"
Cohesion: 0.12
Nodes (34): advance(), advanceBody, assertDedicated(), chain, dedicatedDatabase(), DEMO_POND_NAME, DEMO_SOURCE_ID, DEMO_USER_ID (+26 more)

### Community 14 - "Alert Advisory & Downstream Risks"
Cohesion: 0.09
Nodes (32): AlertAdvisory(), CHANNEL, label(), urgencyText(), DownstreamRiskList(), DownstreamRisks(), label(), leadText() (+24 more)

### Community 15 - "Web Root Layout"
Cohesion: 0.09
Nodes (29): dynamic, metadata, RootLayout(), viewport, AppShell(), Brand(), NavLinks(), ShellProps (+21 more)

### Community 16 - "Anomaly Simulator"
Cohesion: 0.11
Nodes (25): anomalyIntensity(), anomalyPlan(), applyAnomaly(), KIND_NAMES, KINDS, clamp(), createPondGenerator(), step() (+17 more)

### Community 17 - "Vision App Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, expo, expo-camera, expo-constants, expo-status-bar, @expo/vector-icons, react, react-native (+25 more)

### Community 18 - "AI Advisor Core"
Cohesion: 0.14
Nodes (29): createAdvisor(), analyse(), handle(), run(), solve(), triageQuestions(), addNote(), NOTE_CATEGORIES (+21 more)

### Community 19 - "Backend REST Routes"
Cohesion: 0.16
Nodes (29): buildRouter(), listNotes(), trendOf(), acknowledge(), demoMeasurement(), pondDownstreamRisks(), worstDoForecast(), latestByParameter() (+21 more)

### Community 20 - "FWI Dataset Mapping"
Cohesion: 0.13
Nodes (25): COLUMNS, DATASET, DEMO_USER_ID, fingerprint(), mapRow(), PARAMS, parseIstTimestamp(), POND_NAMES (+17 more)

### Community 21 - "Vision Logger"
Cohesion: 0.11
Nodes (23): entries, formatEntry(), formatTime(), listeners, LogEntry, LogLevel, LogTag, MAX_ENTRIES (+15 more)

### Community 22 - "Advisor & Alert Events"
Cohesion: 0.14
Nodes (20): NOTIFY, SYSTEM_PROMPT, URGENCY, EVENT_FOR, publishAlertChanges(), ACTION, describeAlert(), WHY (+12 more)

### Community 23 - "3D Farm Scene"
Cohesion: 0.12
Nodes (29): aimSun(), applyZoom(), Assets, bakeShadows(), box(), BuildingMesh(), canvasTexture(), clampPan() (+21 more)

### Community 24 - "Mobile Providers & Ponds Data"
Cohesion: 0.14
Nodes (27): RootLayout(), AppStoreProvider(), LiveDataProvider(), date(), ForecastItem, getPondForecast(), getPondHistory(), getPondSummaries() (+19 more)

### Community 25 - "Mobile Realtime Client"
Cohesion: 0.10
Nodes (16): API_ORIGIN, ALERT_EVENTS, AlertEventName, emitStatus(), ensureSocket(), GIVE_UP_AFTER_ATTEMPTS, pauseRealtime(), POND_EVENTS (+8 more)

### Community 26 - "Mobile App Dependencies"
Cohesion: 0.07
Nodes (27): eslint, expo, expo-constants, expo-status-bar, @expo/vector-icons, react, react-dom, react-native (+19 more)

### Community 27 - "Farm Fallback & Layout"
Cohesion: 0.11
Nodes (24): ScenePond, BRIDGE, build(), Building, CENTRAL, colX(), CORNER, expand() (+16 more)

### Community 28 - "Historical Replay"
Cohesion: 0.12
Nodes (24): ReplayRecord, AlertEvent, clamp(), DEFAULT_SPEED, deriveAlerts(), FORECAST_EVERY_MS, idlePlayback(), Invalid (+16 more)

### Community 29 - "Backend Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, cors, express, mongodb, socket.io, zod, devDependencies, socket.io-client (+16 more)

### Community 30 - "ML Python Worker"
Cohesion: 0.12
Nodes (16): createPythonWorker(), request(), start(), MlError, WORKER, CSV, mode, pyOk (+8 more)

### Community 31 - "Vision Main Screen"
Cohesion: 0.12
Nodes (16): App(), DEFAULT_REF_SIZE, MainVisionScreen(), handleStart(), PREVIEW_H, StatusLabel, styles, { width: SCREEN_W } (+8 more)

### Community 32 - "Backend Analytics Queries"
Cohesion: 0.16
Nodes (19): BUCKETS, comparePonds(), pondAnalytics(), query(), resolveRange(), stats(), input, SCENARIOS (+11 more)

### Community 33 - "Test Fixtures"
Cohesion: 0.11
Nodes (14): base, fixtures, ids, t(), T0, ALERT_STATUSES, date, FIXTURE_TAG (+6 more)

### Community 34 - "Database Connect & Indexes"
Cohesion: 0.20
Nodes (13): indexes, DB_NAME, describeTarget(), getDb(), getTarget(), requireUri(), root, run() (+5 more)

### Community 35 - "Frontend Dependencies"
Cohesion: 0.08
Nodes (23): eslint, react, react-dom, socket.io-client, @types/react, typescript, zod, name (+15 more)

### Community 36 - "Farm Demo Data"
Cohesion: 0.11
Nodes (18): FARM, slotLabel(), DEMO_POND_COUNT, demoFarm(), ok(), P, Spec, SPECS (+10 more)

### Community 37 - "What-If Simulation Form"
Cohesion: 0.14
Nodes (21): ACTION_TEXT, INFERENCE_TEXT, PARAM_ORDER, SCENARIO_LABEL, SimulationForm(), request(), buildSimRequest(), defaultSimInput() (+13 more)

### Community 38 - "Replay Tests"
Cohesion: 0.11
Nodes (18): api, charts, click(), coverage, DO, flush(), iso(), open() (+10 more)

### Community 39 - "Mobile Alert Detail & Notifications"
Cohesion: 0.16
Nodes (17): STATE_TEXT, styles, styles, Tab, AdvisoryPanel(), CHANNEL, styles, urgencyText() (+9 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (21): dependencies, mongodb, description, engines, node, mongodb, name, private (+13 more)

### Community 41 - "Community 41"
Cohesion: 0.19
Nodes (19): addMeasurement(), applySnapshot(), initialPondsState, isNewerSnapshot(), mergeSeries(), PondsAction, pondsReducer(), PondsState (+11 more)

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (18): SpeciesSettings(), save(), startEdit(), submit(), CatalogueEntry, ReferenceRange, SpeciesRequest, buildSpeciesRequest() (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.10
Nodes (20): backgroundColor, backgroundImage, foregroundImage, monochromeImage, adaptiveIcon, predictiveBackGestureEnabled, expo, android (+12 more)

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (17): acknowledgeAlert(), date(), getActiveAlerts(), getAlertHistory(), getPondAlerts(), isObj(), normalizeAdvisory(), normalizeAlert() (+9 more)

### Community 45 - "Community 45"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (10): base_features(), build_features(), clip_pred(), feature_columns(), forecast_block(), k_features(), make_grid(), _pick() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.20
Nodes (12): createApp(), errorHandler(), notFoundHandler(), requestLogger(), AiError, createJevClient(), evaluate(), sleep() (+4 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (18): dependencies, expo, expo-asset, expo-constants, expo-linking, expo-router, expo-status-bar, @expo/vector-icons (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.18
Nodes (12): bump(), clamp(), createSimulator(), step(), DERIVED_PARAMETERS, NEUTRAL, rng(), SIM_PARAMETERS (+4 more)

### Community 50 - "Community 50"
Cohesion: 0.12
Nodes (17): devDependencies, eslint, eslint-config-next, jsdom, postcss, tailwindcss, @tailwindcss/postcss, @testing-library/jest-dom (+9 more)

### Community 51 - "Community 51"
Cohesion: 0.14
Nodes (12): applyView(), CAMERA, cameraOffset(), cross(), dot(), FARM_POND_COUNT, fitZoom(), GAP (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (9): ForecastError, InsufficientHistoryError, load_artifact(), predict(), predict_all_parameters(), _steps_between(), UnsupportedHorizonError, _validate() (+1 more)

### Community 53 - "Community 53"
Cohesion: 0.18
Nodes (15): Props, AlertsAction, alertsReducer(), AlertsState, initialAlertsState, LoadState, RANK, upsert() (+7 more)

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (13): advanceTimers(), BehaviourState, CLASSIFIED, ClassifierInput, classifyBehaviour(), isClassified(), angleDeg(), BehaviourTransition (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.20
Nodes (14): applyCondition(), applyReading(), CONTEXT_KEYS, openKeyFor(), SOURCE_FOR_ALERT, buildHistory(), FROM_API, istToDate() (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (13): active, dataState(), DECIMALS, DEFAULT_LIMITS, DEFAULT_SOURCE, FILE_KEYS, LIMIT_KEYS, PHYSICAL (+5 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (9): listeners, read(), subscribe(), WelcomeCard(), Stats, OverviewSummary, plural(), summarizeOverview() (+1 more)

### Community 58 - "Community 58"
Cohesion: 0.25
Nodes (6): color(), main(), print_description(), print_final_report(), run_video(), stamp()

### Community 59 - "Community 59"
Cohesion: 0.18
Nodes (13): BoundingBoxOverlay(), COLOUR_MAP, Props, styles, BEHAVIOUR_COLOUR, Card(), FishStatsPanel, Props (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.20
Nodes (10): SpeciesDetail(), SpeciesScreen(), styles, Props, styles, DemoLabel(), styles, Range (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.24
Nodes (9): downstreamRisks(), fmt(), istHour(), unionizedFraction(), PARAMETER_LABEL, atIstHour(), schema, TREND (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.14
Nodes (13): name, private, scripts, build:frontend, db:standardize-names, dev:backend, dev:frontend, simulator (+5 more)

### Community 63 - "Community 63"
Cohesion: 0.23
Nodes (8): DEFAULT_BEHAVIOUR_CONFIG, REFERENCE_FRAME_WIDTH, resolveConfig(), computeStats(), EMPTY_STATS, iou(), assertInvariants(), stats()

### Community 64 - "Community 64"
Cohesion: 0.23
Nodes (8): BehaviourConfig, BBox, Detection, TrackerUpdate, box(), det(), range(), Rig

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (13): dependencies, clsx, geist, next, @phosphor-icons/react, react, react-dom, @react-three/drei (+5 more)

### Community 66 - "Community 66"
Cohesion: 0.26
Nodes (11): mk(), pred(), AlertProbe(), fleet(), mocks, mount(), pond(), Probe() (+3 more)

### Community 67 - "Community 67"
Cohesion: 0.21
Nodes (11): Dashboard UX plan, Alert lifecycle, Web dashboard (Next.js), Idempotent ingestion, Measurement pipeline, Mobile app (Expo), PondFix system, Realtime events (+3 more)

### Community 68 - "Community 68"
Cohesion: 0.20
Nodes (10): FarmFallback(), FarmScene, FarmTwin(), SceneBoundary, SceneSkeleton(), useReducedMotion(), assignSlots(), needsAttention() (+2 more)

### Community 69 - "Community 69"
Cohesion: 0.18
Nodes (6): api, ponds, SEQUENCE, @testing-library/jest-dom, @testing-library/react, vitest

### Community 70 - "Community 70"
Cohesion: 0.27
Nodes (6): clean(), handle(), load_model(), log(), main(), sha256()

### Community 71 - "Community 71"
Cohesion: 0.23
Nodes (4): classify_do(), classify_value(), get_thresholds(), validate()

### Community 72 - "Community 72"
Cohesion: 0.29
Nodes (8): AppActions, AppState, AppStore, Ctx, DEFAULT_SETTINGS, DEMO_PROFILE, AlertSettings, FarmerProfile

### Community 74 - "Community 74"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, baseUrl, ignoreDeprecations, paths, strict, exclude, extends (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.22
Nodes (3): openAlerts(), renderLiveApp(), REAL_PONDS

### Community 76 - "Community 76"
Cohesion: 0.18
Nodes (9): PARAMETER_DEMO_STEPS, ACK, ALL, api, DO, FC, PH, RES (+1 more)

### Community 77 - "Community 77"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-expo, jest, jest-expo, @react-native/jest-preset, react-test-renderer, @testing-library/react-native (+3 more)

### Community 78 - "Community 78"
Cohesion: 0.31
Nodes (9): save(), addNote(), getNotes(), isObj(), normalizeNote(), normalizeNotes(), Raw, advisory (+1 more)

### Community 79 - "Community 79"
Cohesion: 0.18
Nodes (10): description, engines, node, name, private, scripts, start, start:anom (+2 more)

### Community 80 - "Community 80"
Cohesion: 0.20
Nodes (9): expo, extra, name, orientation, plugins, slug, userInterfaceStyle, version (+1 more)

### Community 81 - "Community 81"
Cohesion: 0.20
Nodes (7): api, byParam, charts, ponds, renderIt(), rules, series

### Community 82 - "Community 82"
Cohesion: 0.20
Nodes (5): api, form(), ponds, response, rules

### Community 83 - "Community 83"
Cohesion: 0.20
Nodes (10): scripts, android, ios, lint, start, test, test:e2e, test:watch (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (7): Anti-slop frontend design skill, Brief inference, Frontend design system, Farm view (Digital Twin), Data-integrity rules, Simulation historical replay, 3D digital twin

### Community 86 - "Community 86"
Cohesion: 0.28
Nodes (6): Alert advisor Jev + LLM, Alert lifecycle (alerts collection), Backend risk rules service, Species profiles and guidance, Alert assistant tests, Risk rules

### Community 87 - "Community 87"
Cohesion: 0.28
Nodes (8): config, events, io, lanAddresses(), server, stop(), target, closeDb()

### Community 88 - "Community 88"
Cohesion: 0.22
Nodes (3): dir, sample, @vitejs/plugin-react

### Community 89 - "Community 89"
Cohesion: 0.22
Nodes (8): compilerOptions, paths, strict, types, exclude, extends, include, expo/tsconfig.base

### Community 90 - "Community 90"
Cohesion: 0.39
Nodes (5): ByteTrack tracker config, Behaviour classification and tuning, Local computer vision server, Detection model, PondFix Vision fish activity monitor

### Community 91 - "Community 91"
Cohesion: 0.43
Nodes (7): countsLine(), createLogger(), DEFAULT_LOG_SETTINGS, f(), iso(), LogSettings, trackLine()

### Community 92 - "Community 92"
Cohesion: 0.29
Nodes (6): Database collections, Deduplication and lifecycle, Indexes, Simulated water chemistry, Backend (Express), MongoDB Atlas database

### Community 93 - "Community 93"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 94 - "Community 94"
Cohesion: 0.47
Nodes (5): at(), last(), lines(), post(), v()

### Community 96 - "Community 96"
Cohesion: 0.50
Nodes (4): Historical replay (read-only), FWI monitoring dataset, FWI import mapping, Historical replay (FWI data)

### Community 97 - "Community 97"
Cohesion: 0.40
Nodes (4): Inference worker (ml/worker.py), ML model requirements, Pinned scikit-learn model dependencies, Forecasting engine

### Community 98 - "Community 98"
Cohesion: 0.40
Nodes (3): AFTERNOON, NIGHT, p()

### Community 100 - "Community 100"
Cohesion: 0.40
Nodes (3): { defineConfig }, expoConfig, eslint-config-expo

### Community 101 - "Community 101"
Cohesion: 0.40
Nodes (5): jest, moduleNameMapper, preset, setupFilesAfterEnv, testPathIgnorePatterns

### Community 102 - "Community 102"
Cohesion: 0.50
Nodes (3): Mobile live data, Mobile navigation, Mobile status rules

## Knowledge Gaps
- **66 isolated node(s):** `@expo/vector-icons`, `expo`, `expo-constants`, `expo-status-bar`, `react` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 927 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `expo-router` connect `Mobile Alert & Login Screens` to `Mobile Forecast & Pond Detail`, `Mobile Diagnostics & Layout`, `Web Comparison Tables`, `Mobile Alert Detail & Notifications`, `Community 75`, `Mobile Providers & Ponds Data`, `Mobile App Dependencies`, `Community 60`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **What connects `@expo/vector-icons`, `expo`, `expo-constants` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Web Pond Detail Page` be split into smaller, more focused modules?**
  _Cohesion score 0.07372346528973035 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Community 69` to `Web Pond Detail Page`, `Web Trend Charts`, `Web Pond Panel & Advisor Lab`, `Frontend Dependencies`, `Farm Demo Data`, `Replay Tests`, `Community 76`, `Alert Advisory & Downstream Risks`, `Community 81`, `Community 82`, `Community 51`, `Community 88`, `Community 57`, `Historical Replay`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Should `Mobile Alert & Login Screens` be split into smaller, more focused modules?**
  _Cohesion score 0.09725986148750376 - nodes in this community are weakly interconnected._
- **Why does `next` connect `Web Alerts & Analytics Pages` to `Web Pond Detail Page`, `Web Pond Panel & Advisor Lab`, `Frontend Dependencies`, `Web Farm Twin View`, `What-If Simulation Form`, `Pond Badge & Alert Demo`, `Web Root Layout`, `FWI Dataset Mapping`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `Web Trend Charts` be split into smaller, more focused modules?**
  _Cohesion score 0.06882716049382716 - nodes in this community are weakly interconnected._