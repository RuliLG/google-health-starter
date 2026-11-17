# Google Health Starter

A starter repo that a person opens with Claude Code to build their own personal health app on top of their Fitbit data (Google Health API), and to connect it to anything else they like (calendar, tasks, food log, …).

The person using this repo may not be technical. Explain in plain words, one step at a time, and do the work for them.

## First run

1. `npm install` (once). Node 22+ is required.
2. `npm run doctor`. If anything fails, use the **google-health-connect** skill (`.claude/skills/google-health-connect/`) to connect their account. It handles first setup, the weekly re-login and errors.
3. `npm run dev` opens the app. The first sync downloads the last 30 days. After that it stays up to date by itself while the app is open.
4. If `me/profile.md` does not exist, run the **health-onboarding** skill: a short interview, three ideas that fit them, and the first version built together. If it exists, read it first. It holds their goals, tools and **AI/privacy choice**, and you must respect it.

## Architecture (Electron + React + Tailwind v4 + SQLite)

```
.claude/skills/google-health-connect/scripts/lib/google-health.mjs   OAuth + API client (shared with the CLI). Import as "@gh" in main.
src/main/index.ts          window, IPC handlers, sync triggers (startup, timer, wake, focus)
src/main/auth.ts           AuthManager: login state machine + reconnect flow + system notifications
src/main/sync/engine.ts    SyncEngine: periodic incremental sync into SQLite
src/main/sync/catalog.ts   WHAT gets synced: data types, filters, value extractors, daily metrics
src/main/db.ts             node:sqlite (built into Electron, no native build), migrations
src/main/queries.ts        read functions for the UI
src/preload/index.ts       window.health bridge (one function per IPC handler)
src/shared/types.ts        types shared by main, preload and UI (HealthBridge = the UI API)
src/renderer/src/          React UI: App.tsx, components/, lib/hooks.ts (useDaily, useHealthData…)
```

### Data model (SQLite, in the app's userData folder: never in the repo)

- `daily_metrics(date, metric, value, payload)`: **start here for features.** One number per local day: `steps, distance_m, calories_kcal, active_minutes, active_zone_minutes, floors, sedentary_minutes, heart_rate_avg, resting_hr, hrv_ms, spo2_avg, sleep_minutes`.
- `data_points(type, id, start_utc, end_utc, local_date, local_start, value, payload)`: every raw point. Types: `steps`, `distance`, `active-minutes` (per minute), `sleep`, `exercise` (sessions; `payload` holds stages and metrics), `heart-rate-variability`, `oxygen-saturation` (samples), `daily-*` summaries, and `heart-rate-5min` (5-minute avg/min/max rollups; raw heart rate is too dense to store).
- `devices`, `meta` (identity, settings, profile JSON, sync settings), `sync_state` (per stream), `sync_runs` (log).
- `local_date` is the person's wall-clock day. A sleep session counts on the day they wake up.

### Login and sync behavior (do not break these)

- **Auth states** (`src/shared/types.ts` → `AuthState`): `connected`, `expiring` (less than 1 day before Google's 7-day Testing-mode expiry: a banner), `needs_login` (refresh token rejected: a modal "Reconnect" + a system notification, and sync pauses), `account_not_linked` (wrong Google account), `needs_setup` (no OAuth client: setup screen), `logging_in`.
- Every API error goes through `auth.reportError()`. An expired login anywhere flips the UI to reconnect. After a successful login, `AuthManager` emits `connected`, and the engine runs a sync at once.
- **Sync**: at startup, every N minutes (default 15, Settings), on wake from sleep, and on window focus when the last run is more than 5 minutes old. One run at a time. The first run backfills 30 days. Later runs re-download a small overlap (1–3 days) and upsert, so a run is always safe to repeat. When the watch has not synced to Google since the last run, the heavy part is skipped (but a full sync still runs at least every 6 h). Errors in one stream do not stop the others. Network errors back off 1, 2, 4… minutes.

## How to add things

- **A new Google Health data type**: add an entry to `LIST_STREAMS` (or a metric to `DAILY_STREAM`) in `src/main/sync/catalog.ts`. Check its JSON shape first with `npm run connect -- list <type> '<filter>'`. See `references/api.md` for filters (underscores in filters, hyphens in URLs).
- **A new screen or card**: a React component in `src/renderer/src/components/`. Read data with `useDaily([...metrics], from, to)` or `useHealthData(() => window.health.data.points(type, from, to))`. Both reload by themselves after each sync.
- **A new query**: a function in `src/main/queries.ts` → `ipcMain.handle` in `src/main/index.ts` → `src/preload/index.ts` → `HealthBridge` in `src/shared/types.ts`. For quick experiments, `window.health.data.sql("SELECT …")` works (read-only).
- **Another integration** (Google Calendar, a task tool, …): its own module in `src/main/integrations/<name>.ts` with its own table(s) through a new migration in `db.ts`. Keep its credentials outside the repo, in `~/.config/health-starter/<name>.json` (see `health-onboarding/references/integrations.md`). Add a stream to the sync engine if it should refresh periodically.
- **Schema change**: append a new SQL string to `MIGRATIONS` in `src/main/db.ts`. Never edit an old one.

## Checking your work

- `npm run typecheck` and `npm run build` must pass.
- To see the running app: `HEALTH_DEBUG_PORT=9333 npm run dev`, then `agent-browser --session app --cdp 9333 screenshot /abs/path.png` (use a separate `--session`, not the one for the person's browser).
- To test the reconnect flow without waiting 7 days: copy `~/.config/google-health` to a temp dir, set `refresh_token` to garbage in its `token.json`, and run with `GOOGLE_HEALTH_DIR=<temp dir> npm run dev`.

## Rules

- Health data stays on this machine. Tokens live in `~/.config/google-health/` (0600), and the database lives in the app's userData folder. Never print, log or commit them.
- Never send health data to an external service (LLM APIs included) unless the person asks and understands where it goes.
- Use `@gh` (the skill's library) for all Google Health calls. Do not write a second OAuth implementation.
- Never call Google APIs from the renderer. The token stays in the main process.

## Status

- [x] google-health-connect skill (setup, login, CLI, library)
- [x] App template: auth states + reconnect, local DB, periodic incremental sync, starter dashboard
- [x] Path B: a team's shared app (`references/shared-app.md`), tested end to end
- [x] health-onboarding skill: interview → me/profile.md → 3 ideas (19 in the catalog) → first version
- [ ] Integrations built as code (Calendar via iCal, task tools, food photos): documented in health-onboarding/references/integrations.md, built per person on demand
