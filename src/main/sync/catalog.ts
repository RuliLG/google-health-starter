// What the sync engine downloads, and how it turns API JSON into rows.
// To sync a new data type: add an entry to LIST_STREAMS (or DAILY_ROLLUPS) and run the app.
// API details and quirks: .claude/skills/google-health-connect/references/api.md

import type { DailyMetric } from "@shared/types";

/** How a data type is filtered by time in list calls (AIP-160). */
export type FilterKind = "interval" | "sample" | "daily" | "sleep" | "session";

export interface ListStream {
  kind: "list";
  type: string; // API data type (URL form, with hyphens)
  label: string;
  filter: FilterKind;
  overlapDays: number; // re-download this many days each run (late uploads, edited sessions)
  pageSize: number;
  value: (p: any) => number | null; // p = the inner object, e.g. point.steps
  daily?: DailyMetric; // also write one value per day into daily_metrics
}

export interface HeartRateStream {
  kind: "hr-rollup";
  type: "heart-rate";
  storeAs: "heart-rate-5min";
  label: string;
  windowSize: string;
  chunkDays: number;
  overlapDays: number;
}

export interface DailyRollupMetric {
  type: string; // API data type for dailyRollUp
  metric: DailyMetric;
  value: (r: any) => number | null; // r = the rollup point
}

export interface DailyStream {
  kind: "daily";
  type: "daily-rollups";
  label: string;
  chunkDays: number; // 14 = max for heart-rate, total-calories, active-minutes
  overlapDays: number;
  metrics: DailyRollupMetric[];
}

export type Stream = ListStream | HeartRateStream | DailyStream;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const seconds = (v: unknown): number | null => num(typeof v === "string" ? v.replace(/s$/, "") : v);
const sum = (arr: any[] | undefined, pick: (x: any) => unknown) => (arr || []).reduce((t, x) => t + (num(pick(x)) ?? 0), 0);

export const LIST_STREAMS: ListStream[] = [
  // Minute-level activity (about 1440 rows per day each)
  { kind: "list", type: "steps", label: "Steps (per minute)", filter: "interval", overlapDays: 1, pageSize: 10000, value: (p) => num(p.count) },
  { kind: "list", type: "distance", label: "Distance (per minute)", filter: "interval", overlapDays: 1, pageSize: 10000, value: (p) => (num(p.millimeters) ?? 0) / 1000 },
  { kind: "list", type: "active-minutes", label: "Active minutes", filter: "interval", overlapDays: 1, pageSize: 10000, value: (p) => sum(p.activeMinutesByActivityLevel, (x) => x.activeMinutes) },
  // Sessions
  { kind: "list", type: "sleep", label: "Sleep", filter: "sleep", overlapDays: 3, pageSize: 25, value: (p) => num(p.summary?.minutesAsleep), daily: "sleep_minutes" },
  { kind: "list", type: "exercise", label: "Exercise", filter: "session", overlapDays: 3, pageSize: 25, value: (p) => (seconds(p.activeDuration) ?? 0) / 60 },
  // Samples (mostly at night)
  { kind: "list", type: "heart-rate-variability", label: "HRV samples", filter: "sample", overlapDays: 2, pageSize: 10000, value: (p) => num(p.rootMeanSquareOfSuccessiveDifferencesMilliseconds) },
  { kind: "list", type: "oxygen-saturation", label: "SpO₂ samples", filter: "sample", overlapDays: 2, pageSize: 10000, value: (p) => num(p.percentage) },
  // Daily summaries computed by Google
  { kind: "list", type: "daily-resting-heart-rate", label: "Resting heart rate", filter: "daily", overlapDays: 3, pageSize: 1000, value: (p) => num(p.beatsPerMinute), daily: "resting_hr" },
  { kind: "list", type: "daily-heart-rate-variability", label: "Daily HRV", filter: "daily", overlapDays: 3, pageSize: 1000, value: (p) => num(p.averageHeartRateVariabilityMilliseconds), daily: "hrv_ms" },
  { kind: "list", type: "daily-oxygen-saturation", label: "Daily SpO₂", filter: "daily", overlapDays: 3, pageSize: 1000, value: (p) => num(p.averagePercentage), daily: "spo2_avg" },
];

export const HEART_RATE_STREAM: HeartRateStream = {
  kind: "hr-rollup",
  type: "heart-rate",
  storeAs: "heart-rate-5min",
  label: "Heart rate (5-min avg/min/max)",
  windowSize: "300s",
  chunkDays: 7,
  overlapDays: 1,
};

export const DAILY_STREAM: DailyStream = {
  kind: "daily",
  type: "daily-rollups",
  label: "Daily totals",
  chunkDays: 14,
  overlapDays: 3,
  metrics: [
    { type: "steps", metric: "steps", value: (r) => num(r.steps?.countSum) },
    { type: "distance", metric: "distance_m", value: (r) => { const mm = num(r.distance?.millimetersSum); return mm == null ? null : mm / 1000; } },
    { type: "total-calories", metric: "calories_kcal", value: (r) => num(r.totalCalories?.kcalSum) },
    { type: "active-minutes", metric: "active_minutes", value: (r) => sum(r.activeMinutes?.activeMinutesRollupByActivityLevel, (x) => x.activeMinutesSum) },
    { type: "active-zone-minutes", metric: "active_zone_minutes", value: (r) => { const a = r.activeZoneMinutes; return a ? (num(a.sumInFatBurnHeartZone) ?? 0) + (num(a.sumInCardioHeartZone) ?? 0) + (num(a.sumInPeakHeartZone) ?? 0) : null; } },
    { type: "floors", metric: "floors", value: (r) => num(r.floors?.countSum) },
    { type: "sedentary-period", metric: "sedentary_minutes", value: (r) => { const s = seconds(r.sedentaryPeriod?.durationSum); return s == null ? null : s / 60; } },
    { type: "heart-rate", metric: "heart_rate_avg", value: (r) => num(r.heartRate?.beatsPerMinuteAvg) },
  ],
};

export const ALL_STREAMS: Stream[] = [...LIST_STREAMS, HEART_RATE_STREAM, DAILY_STREAM];

/** Filter field names use underscores ("heart_rate"), URLs use hyphens ("heart-rate"). */
export function filterFor(stream: ListStream, fromDate: string): string {
  const f = stream.type.replace(/-/g, "_");
  switch (stream.filter) {
    case "interval":
    case "session":
      return `${f}.interval.civil_start_time >= "${fromDate}"`;
    case "sample":
      return `${f}.sample_time.civil_time >= "${fromDate}"`;
    case "daily":
      return `${f}.date >= "${fromDate}"`;
    case "sleep":
      return `sleep.interval.civil_end_time >= "${fromDate}"`;
  }
}

/** "heart-rate-variability" -> "heartRateVariability" (the key that holds the data in each point). */
export const payloadKey = (type: string) => type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
