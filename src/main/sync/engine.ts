// The sync engine: keeps the local database up to date while the app is open.
//
// - Runs at startup, then every N minutes (default 15), on wake from sleep, and when the window
//   gets focus after a while. One run at a time.
// - First run backfills the last `backfillDays` days. Later runs re-download a short overlap window
//   (late uploads, edited sleep), and upsert, so re-running is always safe.
// - Cheap check first: if the watch has not synced to Google since our last run, skip the heavy part.
// - Auth errors stop the run and flip the UI to "reconnect" (see AuthManager). Other errors are
//   recorded per stream and the rest of the run continues.

import { EventEmitter } from "node:events";
import * as gh from "@gh";
import type { SyncStatus, StreamStatus, SyncState } from "@shared/types";
import { type DB, getMeta, setMeta, tx } from "../db";
import type { AuthManager } from "../auth";
import { ALL_STREAMS, DAILY_STREAM, HEART_RATE_STREAM, LIST_STREAMS, type DailyStream, type HeartRateStream, type ListStream, filterFor, payloadKey } from "./catalog";
import { addDays, civilToLocal, nowIso, todayIn, utcToLocal } from "./time";

const DEFAULT_INTERVAL_MIN = 15;
const DEFAULT_BACKFILL_DAYS = 30;
const FORCE_FULL_EVERY_MS = 6 * 60 * 60 * 1000; // even if the device has not synced, refresh every 6 h
const FOCUS_RESYNC_AFTER_MS = 5 * 60 * 1000;

class AuthAbort extends Error {}

export class SyncEngine extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private consecutiveFailures = 0;
  private status: SyncStatus;

  constructor(private db: DB, private auth: AuthManager) {
    super();
    this.status = {
      state: "idle",
      trigger: null,
      lastRunAt: getMeta(db, "last_run_at"),
      lastSuccessAt: getMeta(db, "last_success_at"),
      nextRunAt: null,
      intervalMinutes: Number(getMeta(db, "sync_interval_min") ?? DEFAULT_INTERVAL_MIN),
      backfillDays: Number(getMeta(db, "backfill_days") ?? DEFAULT_BACKFILL_DAYS),
      progress: null,
      lastError: null,
      deviceLastSyncTime: getMeta(db, "device_last_sync_time"),
      isFirstSync: !getMeta(db, "last_success_at"),
    };
  }

  get current() {
    return this.status;
  }

  start() {
    void this.runNow("startup");
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  setIntervalMinutes(min: number) {
    const m = Math.min(240, Math.max(5, Math.round(min)));
    setMeta(this.db, "sync_interval_min", String(m));
    this.update({ intervalMinutes: m });
    if (!this.running) this.schedule(m * 60_000);
    return this.status;
  }

  /** Called on window focus: sync if the last run is old enough. */
  onFocus() {
    const last = this.status.lastRunAt ? Date.parse(this.status.lastRunAt) : 0;
    if (Date.now() - last > FOCUS_RESYNC_AFTER_MS) void this.runNow("focus");
  }

  /** Starts a run unless one is in progress. trigger: startup|interval|manual|focus|resume|login */
  runNow(trigger: string, { force = false } = {}): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run(trigger, force || trigger === "manual" || trigger === "login").finally(() => {
      this.running = null;
    });
    return this.running;
  }

  streams(): StreamStatus[] {
    const rows = this.db.prepare("SELECT * FROM sync_state").all() as any[];
    const byStream = new Map(rows.map((r) => [r.stream, r]));
    const counts = new Map(
      (this.db.prepare("SELECT type, COUNT(*) AS n FROM data_points GROUP BY type").all() as any[]).map((r) => [r.type, r.n as number]),
    );
    const dailyCount = (this.db.prepare("SELECT COUNT(*) AS n FROM daily_metrics").get() as any).n as number;
    return ALL_STREAMS.map((s) => {
      const r = byStream.get(s.type);
      const total = s.kind === "daily" ? dailyCount : counts.get(s.kind === "hr-rollup" ? s.storeAs : s.type) ?? 0;
      return {
        stream: s.type,
        label: s.label,
        lastSuccessAt: r?.last_success_at ?? null,
        syncedFrom: r?.synced_from ?? null,
        lastError: r?.last_error ?? null,
        lastErrorCode: r?.last_error_code ?? null,
        rowsLastRun: r?.rows_last_run ?? 0,
        totalRows: total,
      };
    });
  }

  // ---------------------------------------------------------------------------------------------

  private async run(trigger: string, force: boolean) {
    if (this.timer) clearTimeout(this.timer);
    const auth = this.auth.check();
    if (!this.auth.usable) {
      this.update({ state: "paused", trigger, progress: null, nextRunAt: null, lastError: auth.message });
      return; // AuthManager emits "connected" after a login, which triggers a new run
    }

    const startedAt = nowIso();
    const runId = Number(this.db.prepare("INSERT INTO sync_runs (started_at, trigger, status) VALUES (?, ?, 'running')").run(startedAt, trigger).lastInsertRowid);
    this.update({ state: "syncing", trigger, lastRunAt: startedAt, lastError: null, progress: null });
    setMeta(this.db, "last_run_at", startedAt);

    let rows = 0;
    let streamErrors = 0;
    let state: SyncState = "idle";
    let error: string | null = null;
    try {
      const timeZone = await this.refreshAccount();
      const deviceSync = await this.refreshDevices();

      const lastSuccess = this.status.lastSuccessAt ? Date.parse(this.status.lastSuccessAt) : 0;
      const deviceUnchanged = deviceSync && this.status.deviceLastSyncTime === deviceSync && Date.now() - lastSuccess < FORCE_FULL_EVERY_MS;
      if (!force && deviceUnchanged && !this.status.isFirstSync) {
        error = null; // nothing new on Google's side yet
      } else {
        const today = todayIn(timeZone);
        const work = [...LIST_STREAMS, HEART_RATE_STREAM, DAILY_STREAM];
        for (let i = 0; i < work.length; i++) {
          const s = work[i];
          this.update({ progress: { stream: s.type, label: s.label, done: i, total: work.length } });
          try {
            const n = s.kind === "list" ? await this.syncList(s, today) : s.kind === "hr-rollup" ? await this.syncHeartRate(s, today) : await this.syncDaily(s, today);
            rows += n;
            this.markStream(s.type, { ok: true, rows: n });
          } catch (e: any) {
            if (this.auth.reportError(e)) throw new AuthAbort(e.message);
            if (e?.code === "NETWORK") throw e;
            streamErrors++;
            this.markStream(s.type, { ok: false, error: e?.message ?? String(e), code: e?.code ?? "ERROR" });
          }
        }
        if (deviceSync) {
          setMeta(this.db, "device_last_sync_time", deviceSync);
          this.update({ deviceLastSyncTime: deviceSync });
        }
      }
      const doneAt = nowIso();
      setMeta(this.db, "last_success_at", doneAt);
      this.update({ lastSuccessAt: doneAt, isFirstSync: false });
      this.consecutiveFailures = 0;
      if (streamErrors) error = `${streamErrors} data type(s) failed; see Settings → Data`;
    } catch (e: any) {
      if (e instanceof AuthAbort || this.auth.reportError(e)) {
        state = "paused";
        error = this.auth.current.message;
      } else {
        state = e?.code === "NETWORK" ? "offline" : "error";
        error = e?.code === "NETWORK" ? "No internet connection. Will retry automatically." : e?.message ?? String(e);
        this.consecutiveFailures++;
      }
    }

    const runStatus = state !== "idle" ? state : streamErrors ? "partial" : "ok";
    this.db.prepare("UPDATE sync_runs SET finished_at = ?, status = ?, error = ?, rows = ? WHERE id = ?").run(nowIso(), runStatus, error, rows, runId);
    this.db.prepare("DELETE FROM sync_runs WHERE id < ?").run(runId - 500); // keep the log small
    this.update({ state, progress: null, lastError: error });
    if (rows > 0) this.emit("data-changed");

    if (state === "paused") return;
    const base = this.status.intervalMinutes * 60_000;
    // Back off after failures: 1, 2, 4, 8… minutes, never longer than the normal interval.
    const delay = this.consecutiveFailures ? Math.min(base, 60_000 * 2 ** (this.consecutiveFailures - 1)) : base;
    this.schedule(delay);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.runNow("interval"), ms);
    this.update({ nextRunAt: new Date(Date.now() + ms).toISOString() });
  }

  /** Identity + settings + profile. Returns the person's time zone. Also our "is the account linked" check. */
  private async refreshAccount(): Promise<string | undefined> {
    const [identity, settings, profile] = await Promise.all([
      gh.api("GET", "users/me/identity"),
      gh.api("GET", "users/me/settings").catch(() => null),
      gh.api("GET", "users/me/profile").catch(() => null),
    ]);
    setMeta(this.db, "identity", JSON.stringify(identity));
    if (settings) setMeta(this.db, "settings", JSON.stringify(settings));
    if (profile) setMeta(this.db, "profile", JSON.stringify(profile));
    return settings?.timeZone ?? undefined;
  }

  /** Stores paired devices; returns the latest device→Google sync time. */
  private async refreshDevices(): Promise<string | null> {
    const res = await gh.api<{ pairedDevices?: any[] }>("GET", "users/me/pairedDevices");
    const devices = res.pairedDevices ?? [];
    const now = nowIso();
    tx(this.db, () => {
      const up = this.db.prepare("INSERT INTO devices (id, payload, synced_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, synced_at = excluded.synced_at");
      for (const d of devices) up.run(String(d.name ?? d.deviceVersion), JSON.stringify(d), now);
    });
    return devices.map((d) => d.lastSyncTime).filter(Boolean).sort().at(-1) ?? null;
  }

  /** Where this stream should start downloading from (local date). */
  private fromDate(stream: string, overlapDays: number, today: string): string {
    const backfillStart = addDays(today, -this.status.backfillDays);
    const r = this.db.prepare("SELECT last_success_at, synced_from FROM sync_state WHERE stream = ?").get(stream) as any;
    if (!r?.last_success_at || !r.synced_from || r.synced_from > backfillStart) return backfillStart; // first run, or backfill window grew
    return addDays(r.last_success_at.slice(0, 10), -overlapDays);
  }

  private async syncList(s: ListStream, today: string): Promise<number> {
    const from = this.fromDate(s.type, s.overlapDays, today);
    const { dataPoints } = await gh.listDataPoints(s.type, { filter: filterFor(s, from), all: true, pageSize: s.pageSize, maxPages: 1000 });
    const key = payloadKey(s.type);
    const now = nowIso();
    const touchedDates = new Set<string>();

    tx(this.db, () => {
      const up = this.db.prepare(`
        INSERT INTO data_points (type, id, start_utc, end_utc, local_date, local_start, value, payload, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(type, id) DO UPDATE SET start_utc = excluded.start_utc, end_utc = excluded.end_utc, local_date = excluded.local_date,
          local_start = excluded.local_start, value = excluded.value, payload = excluded.payload, synced_at = excluded.synced_at`);
      for (const p of dataPoints) {
        const inner = p[key] ?? {};
        const t = extractTimes(inner, s.type);
        const id = p.name ? String(p.name).split("/").pop()! : `${t.startUtc ?? t.localDate}|${p.dataSource?.platform ?? ""}|${p.dataSource?.device?.displayName ?? ""}|${p.dataSource?.recordingMethod ?? ""}`;
        up.run(s.type, id, t.startUtc, t.endUtc, t.localDate, t.localStart, s.value(inner), JSON.stringify(p), now);
        if (t.localDate) touchedDates.add(t.localDate);
      }
      if (s.daily) this.rebuildDaily(s, [...touchedDates], now);
    });
    this.setSyncedFrom(s.type, from);
    return dataPoints.length;
  }

  /** Mirror a list stream into daily_metrics (sleep: sum of sessions per wake-up day). */
  private rebuildDaily(s: ListStream, dates: string[], now: string) {
    const agg = s.type === "sleep" ? "SUM(value)" : "AVG(value)";
    const sel = this.db.prepare(`SELECT ${agg} AS v FROM data_points WHERE type = ? AND local_date = ?`);
    const up = this.db.prepare("INSERT INTO daily_metrics (date, metric, value, payload, synced_at) VALUES (?, ?, ?, NULL, ?) ON CONFLICT(date, metric) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at");
    for (const d of dates) {
      const v = (sel.get(s.type, d) as any)?.v ?? null;
      up.run(d, s.daily!, v, now);
    }
  }

  private async syncHeartRate(s: HeartRateStream, today: string): Promise<number> {
    const from = this.fromDate(s.type, s.overlapDays, today);
    const tz = JSON.parse(getMeta(this.db, "settings") ?? "{}").timeZone as string | undefined;
    const end = new Date();
    let n = 0;
    const now = nowIso();
    for (let cur = new Date(`${from}T00:00:00Z`); cur < end; ) {
      const next = new Date(Math.min(end.getTime(), cur.getTime() + s.chunkDays * 86400_000));
      const points = await gh.rollUp(s.type, cur.toISOString(), next.toISOString(), s.windowSize);
      tx(this.db, () => {
        const up = this.db.prepare(`
          INSERT INTO data_points (type, id, start_utc, end_utc, local_date, local_start, value, payload, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(type, id) DO UPDATE SET value = excluded.value, payload = excluded.payload, synced_at = excluded.synced_at`);
        for (const p of points) {
          if (p.heartRate?.beatsPerMinuteAvg == null) continue;
          const local = utcToLocal(p.startTime, undefined, tz);
          up.run(s.storeAs, p.startTime, p.startTime, p.endTime, local.date, local.dateTime, p.heartRate.beatsPerMinuteAvg, JSON.stringify(p), now);
          n++;
        }
      });
      cur = next;
    }
    this.setSyncedFrom(s.type, from);
    return n;
  }

  private async syncDaily(s: DailyStream, today: string): Promise<number> {
    const from = this.fromDate(s.type, s.overlapDays, today);
    const endExclusive = addDays(today, 1);
    let n = 0;
    const now = nowIso();
    for (const m of s.metrics) {
      for (let cur = from; cur < endExclusive; cur = addDays(cur, s.chunkDays)) {
        const chunkEnd = addDays(cur, s.chunkDays) < endExclusive ? addDays(cur, s.chunkDays) : endExclusive;
        try {
          const res = await gh.dailyRollUp(m.type, cur, chunkEnd);
          tx(this.db, () => {
            const up = this.db.prepare("INSERT INTO daily_metrics (date, metric, value, payload, synced_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(date, metric) DO UPDATE SET value = excluded.value, payload = excluded.payload, synced_at = excluded.synced_at");
            for (const r of res.rollupDataPoints ?? []) {
              const date = civilToLocal(r.civilStartTime).date;
              if (!date) continue;
              up.run(date, m.metric, m.value(r), JSON.stringify(r), now);
              n++;
            }
          });
        } catch (e: any) {
          // One unsupported metric (e.g. no floors on this device) should not block the others.
          if (e?.code === "HTTP" && e?.status === 400) break;
          throw e;
        }
      }
    }
    this.setSyncedFrom(s.type, from);
    return n;
  }

  private setSyncedFrom(stream: string, from: string) {
    this.db.prepare(`
      INSERT INTO sync_state (stream, synced_from) VALUES (?, ?)
      ON CONFLICT(stream) DO UPDATE SET synced_from = CASE WHEN sync_state.synced_from IS NULL OR excluded.synced_from < sync_state.synced_from THEN excluded.synced_from ELSE sync_state.synced_from END`).run(stream, from);
  }

  private markStream(stream: string, r: { ok: boolean; rows?: number; error?: string; code?: string }) {
    const now = nowIso();
    if (r.ok) {
      this.db.prepare(`
        INSERT INTO sync_state (stream, last_success_at, last_attempt_at, last_error, last_error_code, rows_last_run) VALUES (?, ?, ?, NULL, NULL, ?)
        ON CONFLICT(stream) DO UPDATE SET last_success_at = excluded.last_success_at, last_attempt_at = excluded.last_attempt_at, last_error = NULL, last_error_code = NULL, rows_last_run = excluded.rows_last_run`).run(stream, now, now, r.rows ?? 0);
    } else {
      this.db.prepare(`
        INSERT INTO sync_state (stream, last_attempt_at, last_error, last_error_code) VALUES (?, ?, ?, ?)
        ON CONFLICT(stream) DO UPDATE SET last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error, last_error_code = excluded.last_error_code`).run(stream, now, r.error ?? null, r.code ?? null);
    }
  }

  private update(partial: Partial<SyncStatus>) {
    this.status = { ...this.status, ...partial };
    this.emit("status", this.status);
  }
}

/** Pulls UTC + local times out of an interval, sample, or daily-summary object. */
function extractTimes(inner: any, type: string) {
  if (inner.interval) {
    const iv = inner.interval;
    const start = iv.civilStartTime ? civilToLocal(iv.civilStartTime) : utcToLocal(iv.startTime, iv.startUtcOffset);
    const end = iv.civilEndTime ? civilToLocal(iv.civilEndTime) : utcToLocal(iv.endTime, iv.endUtcOffset);
    // Sleep belongs to the day you wake up.
    return { startUtc: iv.startTime ?? null, endUtc: iv.endTime ?? null, localDate: type === "sleep" ? end.date : start.date, localStart: start.dateTime };
  }
  if (inner.sampleTime) {
    const st = inner.sampleTime;
    const local = st.civilTime ? civilToLocal(st.civilTime) : utcToLocal(st.physicalTime, st.utcOffset);
    return { startUtc: st.physicalTime ?? null, endUtc: null, localDate: local.date, localStart: local.dateTime };
  }
  if (inner.date) {
    const local = civilToLocal({ date: inner.date });
    return { startUtc: null, endUtc: null, localDate: local.date, localStart: local.dateTime };
  }
  return { startUtc: null, endUtc: null, localDate: null, localStart: null };
}
