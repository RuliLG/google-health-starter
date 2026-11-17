// Read functions the UI calls through IPC. Add your own here when you build features
// (and expose them in src/preload/index.ts + src/shared/types.ts).

import type { DailyMetric, DailyRow, DeviceInfo, PointRow, SleepSession } from "@shared/types";
import type { DB } from "./db";

export function daily(db: DB, metrics: DailyMetric[], from: string, to: string): DailyRow[] {
  if (!metrics.length) return [];
  const qs = metrics.map(() => "?").join(",");
  return db
    .prepare(`SELECT date, metric, value FROM daily_metrics WHERE metric IN (${qs}) AND date >= ? AND date <= ? ORDER BY date`)
    .all(...metrics, from, to) as unknown as DailyRow[];
}

export function points(db: DB, type: string, from: string, to: string): PointRow[] {
  const rows = db
    .prepare(`SELECT type, id, start_utc, end_utc, local_date, local_start, value, payload FROM data_points
              WHERE type = ? AND local_date >= ? AND local_date <= ? ORDER BY COALESCE(start_utc, local_start)`)
    .all(type, from, to) as any[];
  return rows.map((r) => ({
    type: r.type,
    id: r.id,
    startUtc: r.start_utc,
    endUtc: r.end_utc,
    localDate: r.local_date,
    localStart: r.local_start,
    value: r.value,
    payload: JSON.parse(r.payload),
  }));
}

export function sleepSessions(db: DB, from: string, to: string): SleepSession[] {
  const rows = db
    .prepare("SELECT id, local_date, start_utc, end_utc, payload FROM data_points WHERE type = 'sleep' AND local_date >= ? AND local_date <= ? ORDER BY start_utc")
    .all(from, to) as any[];
  return rows.map((r) => {
    const s = JSON.parse(r.payload).sleep ?? {};
    const sum = s.summary ?? {};
    return {
      id: r.id,
      localDate: r.local_date,
      startUtc: r.start_utc,
      endUtc: r.end_utc,
      minutesAsleep: sum.minutesAsleep != null ? Number(sum.minutesAsleep) : null,
      minutesAwake: sum.minutesAwake != null ? Number(sum.minutesAwake) : null,
      stages: (sum.stagesSummary ?? []).map((x: any) => ({ type: x.type, minutes: Number(x.minutes) })),
    };
  });
}

export function devices(db: DB): DeviceInfo[] {
  return (db.prepare("SELECT id, payload FROM devices").all() as any[]).map((r) => {
    const d = JSON.parse(r.payload);
    return { id: r.id, name: d.deviceVersion ?? "Device", type: d.deviceType ?? null, batteryLevel: d.batteryLevel ?? null, lastSyncTime: d.lastSyncTime ?? null };
  });
}

/** Read-only SQL for quick experiments from the UI or the dev console. */
export function sql(readOnlyDb: DB, query: string, params: unknown[] = []) {
  if (!/^\s*(select|with)\b/i.test(query)) throw new Error("Only SELECT/WITH queries are allowed here.");
  return readOnlyDb.prepare(query).all(...(params as any[]));
}
