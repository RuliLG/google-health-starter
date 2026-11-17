// React hooks around window.health. Data hooks reload automatically after every sync that changed data.

import { useCallback, useEffect, useState } from "react";
import type { AuthStatus, DailyMetric, DailyRow, SyncStatus } from "@shared/types";

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  useEffect(() => {
    void window.health.auth.status().then(setStatus);
    return window.health.auth.onStatus(setStatus);
  }, []);
  return status;
}

export function useSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    void window.health.sync.status().then(setStatus);
    return window.health.sync.onStatus(setStatus);
  }, []);
  return status;
}

/** Re-runs `load` on mount, when deps change, and whenever a sync wrote new data. */
export function useHealthData<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => void load().then(setData).catch(console.error), deps);
  useEffect(() => {
    run();
    return window.health.data.onChanged(run);
  }, [run]);
  return { data, reload: run };
}

/** Daily metrics pivoted to { date -> { metric -> value } } for the given range. */
export function useDaily(metrics: DailyMetric[], from: string, to: string) {
  return useHealthData(async () => {
    const rows: DailyRow[] = await window.health.data.daily(metrics, from, to);
    const byDate = new Map<string, Partial<Record<DailyMetric, number | null>>>();
    for (const r of rows) byDate.set(r.date, { ...byDate.get(r.date), [r.metric]: r.value });
    return byDate;
  }, [metrics.join(","), from, to]);
}

/** Re-render every `ms` (for "3 min ago" labels). */
export function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
