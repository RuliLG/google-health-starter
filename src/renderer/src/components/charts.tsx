// Tiny dependency-free SVG charts. Swap for a chart library later if you need more.

import { useState } from "react";

export interface Datum { label: string; value: number | null; title?: string }

export function BarChart({ data, height = 96, goal, color = "var(--color-accent)" }: { data: Datum[]; height?: number; goal?: number; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value ?? 0), 1);
  const w = 100 / Math.max(data.length, 1);
  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {goal != null && <line x1="0" x2="100" y1={height - (goal / max) * height} y2={height - (goal / max) * height} stroke="var(--color-muted)" strokeDasharray="1.5 1.5" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />}
        {data.map((d, i) => {
          const h = d.value ? Math.max(1.5, (d.value / max) * (height - 2)) : 0;
          return (
            <rect key={i} x={i * w + w * 0.18} width={w * 0.64} y={height - h} height={h} rx="1.2"
              fill={color} opacity={hover == null ? (i === data.length - 1 ? 1 : 0.55) : hover === i ? 1 : 0.35}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          );
        })}
      </svg>
      <div className="mt-1 flex text-[10px] text-muted">
        {data.map((d, i) => <span key={i} className={`flex-1 text-center ${hover === i ? "text-text" : ""}`}>{d.label}</span>)}
      </div>
      {hover != null && data[hover]?.title && (
        <div className="pointer-events-none absolute -top-7 rounded-md bg-text px-2 py-1 text-[11px] text-bg tabular" style={{ left: `${Math.min(80, hover * w)}%` }}>{data[hover].title}</div>
      )}
    </div>
  );
}

export function LineChart({ data, height = 80, color = "var(--color-accent)", showDots = true, minPoints = 1 }: { data: Datum[]; height?: number; color?: string; showDots?: boolean; minPoints?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.value).filter((v): v is number => v != null);
  if (vals.length < minPoints) {
    return <div className="flex items-center justify-center rounded-lg bg-surface-2 text-xs text-muted" style={{ height }}>{vals.length ? `Trend appears after ${minPoints} days of data (${vals.length} so far)` : "No data yet"}</div>;
  }
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.15 || 1;
  const y = (v: number) => height - ((v - (min - pad)) / (max - min + 2 * pad)) * height;
  const x = (i: number) => (data.length === 1 ? 50 : (i / (data.length - 1)) * 100);
  const pts = data.map((d, i) => (d.value == null ? null : [x(i), y(d.value)] as const));
  const path = pts.reduce((acc, p, i) => (p ? `${acc}${acc && pts[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : acc), "");
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <rect key={i} x={x(i) - 50 / Math.max(data.length, 2)} width={100 / Math.max(data.length, 2)} y="0" height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {showDots && pts.map((p, i) => p && (
        <span key={i} className="pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${p[0]}%`, top: p[1], background: color, opacity: hover === i || i === pts.length - 1 ? 1 : 0.0 }} />
      ))}
      {hover != null && data[hover]?.value != null && (
        <div className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-text px-2 py-1 text-[11px] whitespace-nowrap text-bg tabular" style={{ left: `${x(hover)}%` }}>
          {data[hover].title ?? `${data[hover].label}: ${data[hover].value}`}
        </div>
      )}
    </div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  DEEP: "var(--color-sleep-deep)",
  LIGHT: "var(--color-sleep-light)",
  REM: "var(--color-sleep-rem)",
  AWAKE: "var(--color-sleep-awake)",
};

export function StageBar({ stages }: { stages: { type: string; minutes: number }[] }) {
  const known = stages.filter((s) => STAGE_COLORS[s.type]);
  const total = known.reduce((t, s) => t + s.minutes, 0) || 1;
  const order = ["AWAKE", "REM", "LIGHT", "DEEP"];
  const sorted = [...known].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        {sorted.map((s) => <div key={s.type} style={{ width: `${(s.minutes / total) * 100}%`, background: STAGE_COLORS[s.type] }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {sorted.map((s) => (
          <span key={s.type} className="flex items-center gap-1.5 tabular">
            <span className="size-2 rounded-full" style={{ background: STAGE_COLORS[s.type] }} />
            {s.type.charAt(0) + s.type.slice(1).toLowerCase()} {Math.round(s.minutes)} min
          </span>
        ))}
      </div>
    </div>
  );
}
