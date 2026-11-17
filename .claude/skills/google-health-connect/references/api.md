# Google Health API v4 — practical reference

Verified against a real Fitbit Air on 2026-11-17, plus the discovery doc.

- Base URL: `https://health.googleapis.com/v4/` (`v4beta` also exists with the same methods)
- Discovery doc (full schema): `https://health.googleapis.com/$discovery/rest?version=v4`
- Official docs: https://developers.google.com/health (setup, scopes, endpoints, data-types, migration)
- The legacy Fitbit Web API was shut down on 2026-11-02. Do not use `api.fitbit.com` examples from the internet.

## Contents
1. User endpoints
2. Data points: list, filter, rollup
3. Data types
4. Quirks
5. Scopes ↔ data

## 1. User endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `users/me/identity` | `healthUserId`, `legacyUserId` (old Fitbit id). Good "is the account linked?" check |
| GET / PATCH | `users/me/profile` | age, membershipStartDate, stride lengths |
| GET / PATCH | `users/me/settings` | units, `timeZone`, `utcOffset`, `languageLocale` |
| GET | `users/me/pairedDevices` | `deviceVersion` ("Fitbit Air"), `batteryLevel`, `lastSyncTime`, `features[]` |
| GET | `users/me/irnProfile` | irregular rhythm notification profile |

## 2. Data points

| Method | Path | Notes |
|---|---|---|
| GET | `users/me/dataTypes/{type}/dataPoints` | params `filter`, `pageSize`, `pageToken`, `dataSourceFamily` |
| GET | `…/dataPoints:reconcile` | merged view across sources |
| POST | `…/dataPoints:dailyRollUp` | body `{range:{start:{date:{year,month,day}},end:{date:…}}, windowSizeDays?}`; end is exclusive; max page 90 |
| POST | `…/dataPoints:rollUp` | body `{range:{startTime,endTime} (UTC RFC 3339), windowSize:"300s"}`; max page 10000. A civil `{start,end}` range returns 400 here |
| POST | `…/dataPoints` | write a data point (needs a `*.writeonly` scope) |
| PATCH | `…/dataPoints/{id}` | update |
| POST | `…/dataPoints:batchDelete` | delete |
| GET | `…/dataPoints/{id}:exportExerciseTcx` | exercise as TCX |

Rollup max range: **14 days** for `heart-rate`, `total-calories`, `active-minutes`, `calories-in-heart-rate-zone`. **90 days** for the rest. The start must align with the window.

### Filter syntax (AIP-160)

Operators `>=`, `<`, joined with `AND`. Results come newest first. In the URL path, data type names use hyphens (`heart-rate`). **In filters they use underscores** (`heart_rate`). A hyphen in a filter returns `400 INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION`.

Heart rate is dense: one hour returned more than 1000 samples. Use `rollUp` with a `windowSize` for charts, not raw lists.

| Kind | Field | Example |
|---|---|---|
| Interval types (steps, distance, active-minutes, …) | `<type>.interval.start_time` (RFC 3339) or `.civil_start_time` (local) | `steps.interval.civil_start_time >= "2026-11-17"` |
| Sample types (heart-rate, oxygen-saturation, weight, …) | `<type>.sample_time.physical_time` or `.civil_time` | `heart_rate.sample_time.civil_time >= "2026-11-17T08:00:00"` |
| Daily summaries | `<type>.date` | `daily_resting_heart_rate.date >= "2026-11-10"` |
| Sessions (exercise) | `<type>.interval.civil_start_time` | `exercise.interval.civil_start_time >= "2026-11-01"` |
| **Sleep (special)** | only `sleep.interval.end_time` / `sleep.interval.civil_end_time` (also `OR`) | `sleep.interval.civil_end_time >= "2026-11-16"` |
| **ECG (special)** | only `electrocardiogram.interval.start_time >=` | |

Civil time is the user's local wall-clock time. It is what humans mean by "yesterday". Use civil fields for day-based questions. Use physical (UTC) fields for exact instants.

## 3. Data types seen with data on a Fitbit Air

`steps`, `distance`, `heart-rate`, `daily-resting-heart-rate`, `heart-rate-variability`, `daily-heart-rate-variability`, `oxygen-saturation`, `daily-oxygen-saturation`, `sleep`, `exercise`, `active-minutes`, `total-calories` (rollup only).
Empty on a new device: `vo2-max` (needs more history).
Other documented types: `weight`, `body-fat`, `calories-in-heart-rate-zone`, `electrocardiogram`, nutrition/hydration types and more (https://developers.google.com/health/data-types). If you are unsure, list with a small date filter and look at the response.

Response shapes (abridged):
```jsonc
// steps (per minute)
{"dataSource":{"recordingMethod":"PASSIVELY_MEASURED","device":{"displayName":"Fitbit Air"},"platform":"FITBIT"},
 "steps":{"interval":{"startTime":"…Z","civilStartTime":{"date":{…},"time":{…}},…},"count":"14"}}
// heart-rate
{"heartRate":{"sampleTime":{"physicalTime":"…Z","civilTime":{…}},"beatsPerMinute":"103"}}
// sleep (one session)
{"sleep":{"interval":{…},"type":…,"stages":[…],"summary":{"minutesAsleep":"462","minutesAwake":"14","minutesInSleepPeriod":"476",
  "stagesSummary":[{"type":"AWAKE","minutes":"14","count":"4"},{"type":"LIGHT",…},{"type":"DEEP",…},{"type":"REM",…}]}}}
// dailyRollUp steps
{"rollupDataPoints":[{"civilStartTime":{"date":{…}},"civilEndTime":{…},"steps":{"countSum":"9765"}}]}
// dailyRollUp total-calories → {"totalCalories":{"kcalSum":3148.2}}
```

## 4. Quirks (learned the hard way)

- **Numbers are often strings** (`"count": "14"`). Convert them before you do math.
- `sleep` without a filter can return an **empty page that still has a `nextPageToken`**. Always filter by date, or follow pages (`listDataPoints(type, {all: true})`).
- `total-calories` does not support list ("List is not supported … supported: rollup, dailyRollup").
- `pageSize` looks ignored for some types (oxygen-saturation returned 358 points with `pageSize=5`).
- `dataSourceFamily` needs the full name: `users/me/dataSourceFamilies/google-wearables`. The short form returns 400.
- Today's data is partial until the device syncs (`pairedDevices[].lastSyncTime`).
- Retry 429/5xx with exponential backoff.
- Access tokens live ~1 h. `getAccessToken()` refreshes them automatically. Refresh tokens die after **7 days** in Testing mode → `REAUTH_REQUIRED` → `gh.mjs login`.

## 5. Scopes ↔ data

Approximate mapping, inferred from the scope names and the consent texts, not from an official table. Check https://developers.google.com/health/scopes when it matters.

| Scope (`…/auth/googlehealth.` + ) | Covers |
|---|---|
| `activity_and_fitness.readonly` | steps, distance, calories, active minutes, exercise, VO2 max |
| `health_metrics_and_measurements.readonly` | heart rate, HRV, SpO2, resting HR, weight, temperature |
| `sleep.readonly` | sleep sessions and stages |
| `nutrition.readonly` / `.writeonly` | food, water |
| `profile.readonly`, `settings.readonly` | profile, units, time zone |
| `ecg.readonly`, `irn.readonly` | ECG, irregular rhythm notifications |
| `location.readonly` | GPS of exercises |

A 403 on one data type while others work usually means the person unticked that scope at consent. Log in again and tick it.
