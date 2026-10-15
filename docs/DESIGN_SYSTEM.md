# PondFix design system (web + mobile)

One product on two platforms. The rules below apply to both; `frontend/tests/design-tokens.test.ts` fails if the palette or the
farmer wording drifts apart.

## Colour tokens

| Role | Web (`globals.css`) | Mobile (`constants/colors.ts`) | Hex |
| --- | --- | --- | --- |
| Page | `--color-page` | `background` | `#F6F4EE` |
| Card | `--color-card` | `card` | `#FFFFFF` |
| Text | `--color-ink` | `textPrimary` | `#17282A` |
| Secondary text | `--color-ink-soft` | `textSecondary` | `#4A5A5C` |
| Border | `--color-line` | `border` | `#DEDAD0` |
| Brand / primary action | `--color-brand` | `primary` | `#0F6B66` |
| Brand text | `--color-brand-text` | `primaryText` | `#0C5D59` |
| Healthy | `--color-ok-text` / `--color-ok-bg` | `healthyDark` / `healthySurface` | `#1F6A3E` / `#E5F3EA` |
| Attention | `--color-warn-text` / `--color-warn-bg` | `warningDark` / `warningSurface` | `#8A4E00` / `#FDF1DC` |
| Urgent | `--color-crit-text` / `--color-crit-bg` | `criticalDark` / `criticalSurface` | `#A3271B` / `#FCEBE8` |

Every text/background pair is at least 4.5:1 (most are 5.7:1 or more), chosen for bright outdoor light.

## Status: always icon + word + colour

| Verdict | Words | Icon |
| --- | --- | --- |
| healthy | Pond looks healthy | tick in a circle |
| attention | Attention needed | triangle |
| urgent | Urgent action required | octagon / alert circle |
| unknown | Unable to verify pond condition | question mark |

A pond or farm is **healthy only when every reading is current and in range**. Old or missing data is "unknown", never healthy
(`lib/care.ts` → `farmVerdict`, `pondVerdict`, on both platforms).

## Type and touch

- Web body text 16px, secondary 14px, nothing farmer-facing under 12px. Mobile body 16, secondary 14, metadata 13.
- Touch targets: 44px on touch screens (web `pointer-coarse:`), 48pt minimum on mobile. The web shows a bottom tab bar under 768px.

## Navigation

Primary (both platforms, also the phone bottom bar): **Home · My Ponds · Alerts · Help** and, on web, **Pond Health** (history and
trends); on mobile the fifth tab is **More** (profile, settings and language, species guide, notifications, connection details).
Secondary on web: Ask PondFix, Demo & simulation, Advisor test lab, System status.

## Farmer wording

`frontend/src/i18n/care.en.json` and `mobile-app/src/i18n/locales/en/care.json` are identical (enforced by a test): verdicts,
measurement explanations ("why it matters"), numbered action steps, connection states. The steps follow `knowledge/07_safety` and
`knowledge/01_water_quality`. They never give a chemical dose or a water-exchange amount.

## Connection and freshness states (not interchangeable)

| State | Shown when | Signal |
| --- | --- | --- |
| Connected | live socket connected | Socket.IO `connect` |
| Connecting / Reconnecting | socket retrying (bounded backoff, 1 s doubling to 30 s on web, 10 s on mobile) | socket events |
| No internet | the device itself reports offline | browser `navigator.onLine` (web, and mobile on web). Native has no signal without adding `@react-native-community/netinfo` / `expo-network`, so native never claims it |
| Can't reach PondFix | REST failing (mobile) or 3+ failed socket attempts while online (web) | request outcome |
| Data delayed | newest reading older than `STALE_AFTER_MINUTES` (60) | reading timestamps |
| Pond device not reporting | no reading for 3× the freshness limit | reading timestamps (inferred: the API has no device heartbeat) |

## Languages

- Mobile: i18next with English source and Sarvam-generated drafts (13 languages, `reviewed: false` in `locales/manifest.json`).
- Web: `src/i18n` (English + Telugu draft), chosen with the language selector and kept in the `pondfix.lang` cookie.
- New safety steps and explanations are **English only** in other languages until a native speaker reviews them; the UI says so
  ("Safety steps are shown in English until a reviewed translation is ready"). Run `npm run i18n:translate` in `mobile-app`
  (needs `SARVAM_API_KEY`) to draft them, then have them reviewed.
