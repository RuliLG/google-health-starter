// The starter dashboard. It is meant to be replaced or extended with whatever the person wants.

import type { DailyMetric } from "@shared/types";
import { addDays, ago, dateRange, hoursMinutes, int, oneDecimal, shortDate, timeOfDay, today, weekday } from "../lib/format";
import { useDaily, useHealthData } from "../lib/hooks";
import { BarChart, LineChart, StageBar } from "./charts";

const DAYS = 14;
const METRICS: DailyMetric[] = ["steps", "distance_m", "calories_kcal", "active_zone_minutes", "resting_hr", "hrv_ms", "spo2_avg", "sleep_minutes"];

function Card({ title, children, right, className = "" }: { title: string; children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface p-5 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Big({ value, unit, sub }: { value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div className="text-3xl font-semibold tabular">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Dashboard() {
  const to = today();
  const from = addDays(to, -(DAYS - 1));
  const dates = dateRange(from, to);
  const { data: daily } = useDaily(METRICS, from, to);
  const { data: sleep } = useHealthData(() => window.health.data.sleepSessions(addDays(to, -1), to), [to]);
  const { data: hr } = useHealthData(() => window.health.data.points("heart-rate-5min", to, to), [to]);
  const { data: devices } = useHealthData(() => window.health.data.devices(), []);

  const v = (date: string, m: DailyMetric) => daily?.get(date)?.[m] ?? null;
  const series = (m: DailyMetric, fmt: (n: number | null) => string, unit = "") =>
    dates.map((d) => ({ label: weekday(d).slice(0, 2), value: v(d, m), title: `${shortDate(d)}: ${fmt(v(d, m))}${unit}` }));
  const avg = (m: DailyMetric, n = 7) => {
    const vals = dates.slice(-n).map((d) => v(d, m)).filter((x): x is number => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  const lastNight = sleep?.filter((s) => s.localDate === to).sort((a, b) => (b.minutesAsleep ?? 0) - (a.minutesAsleep ?? 0))[0] ?? sleep?.at(-1);
  const hrToday = (hr ?? []).map((p) => ({ label: p.localStart?.slice(11, 16) ?? "", value: p.value, title: `${p.localStart?.slice(11, 16)}: ${int(p.value)} bpm` }));
  const device = devices?.[0];

  if (daily && daily.size === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">No data on this computer yet. The first sync fills this in.</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="Steps" right={<span className="text-xs text-muted">7-day avg {int(avg("steps"))}</span>}>
        <Big value={int(v(to, "steps"))} sub={`today · ${oneDecimal((v(to, "distance_m") ?? 0) / 1000)} km · ${int(v(to, "calories_kcal"))} kcal`} />
        <div className="mt-4"><BarChart data={series("steps", int)} goal={10000} /></div>
      </Card>

      <Card title="Sleep" right={lastNight && <span className="text-xs text-muted">{timeOfDay(lastNight.startUtc)} → {timeOfDay(lastNight.endUtc)}</span>}>
        <Big value={hoursMinutes(lastNight?.minutesAsleep)} sub={lastNight ? `last night · ${int(lastNight.minutesAwake)} min awake` : "no sleep recorded yet"} />
        {lastNight && <div className="mt-4"><StageBar stages={lastNight.stages} /></div>}
        <div className="mt-4"><BarChart data={series("sleep_minutes", hoursMinutes)} goal={8 * 60} color="var(--color-sleep-deep)" /></div>
      </Card>

      <Card title="Recovery" right={<span className="text-xs text-muted">last {DAYS} days</span>}>
        <div className="grid grid-cols-3 gap-3">
          <Big value={int(v(to, "resting_hr") ?? avg("resting_hr", 1))} unit="bpm" sub="resting HR" />
          <Big value={int(v(to, "hrv_ms"))} unit="ms" sub="HRV" />
          <Big value={oneDecimal(v(to, "spo2_avg"))} unit="%" sub="SpO₂" />
        </div>
        <div className="mt-4 space-y-3">
          <div><div className="mb-1 text-[11px] text-muted">Resting heart rate</div><LineChart data={series("resting_hr", int, " bpm")} height={48} color="var(--color-danger)" minPoints={3} /></div>
          <div><div className="mb-1 text-[11px] text-muted">HRV</div><LineChart data={series("hrv_ms", int, " ms")} height={48} minPoints={3} /></div>
        </div>
      </Card>

      <Card title="Heart rate today" className="md:col-span-2" right={<span className="text-xs text-muted">5-min average</span>}>
        <LineChart data={hrToday} height={120} color="var(--color-danger)" showDots={false} />
      </Card>

      <Card title="Device">
        {device ? (
          <div className="space-y-1.5 text-sm">
            <div className="text-base font-semibold">{device.name}</div>
            <div className="text-muted">Battery <span className="text-text tabular">{device.batteryLevel ?? "–"}%</span></div>
            <div className="text-muted">Last synced to Google <span className="text-text">{ago(device.lastSyncTime)}</span></div>
            <div className="text-muted">Active zone minutes today <span className="text-text tabular">{int(v(to, "active_zone_minutes"))}</span></div>
          </div>
        ) : (
          <div className="text-sm text-muted">No device yet.</div>
        )}
      </Card>
    </div>
  );
}
