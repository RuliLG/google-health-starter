import type { SyncStatus } from "@shared/types";
import { ago, until } from "../lib/format";
import { useTick } from "../lib/hooks";
import { Spinner } from "./AuthPrompt";

export function SyncIndicator({ status }: { status: SyncStatus | null }) {
  useTick(15_000);
  if (!status) return null;
  const dot = {
    idle: "bg-accent",
    syncing: "bg-accent animate-pulse",
    paused: "bg-warn",
    offline: "bg-muted",
    error: "bg-danger",
  }[status.state];

  let text: string;
  if (status.state === "syncing") {
    text = status.progress ? `Syncing ${status.progress.label.toLowerCase()} (${status.progress.done + 1}/${status.progress.total})` : "Syncing…";
  } else if (status.state === "paused") {
    text = "Sync paused: reconnect needed";
  } else if (status.state === "offline") {
    text = "Offline, will retry";
  } else if (status.state === "error") {
    text = `Sync problem, retry in ${until(status.nextRunAt)}`;
  } else {
    text = `Synced ${ago(status.lastSuccessAt)} · next in ${until(status.nextRunAt)}`;
  }

  return (
    <div className="no-drag flex items-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-2" title={status.lastError ?? undefined}>
        <span className={`size-2 rounded-full ${dot}`} />
        <span className="tabular">{text}</span>
      </span>
      <button
        onClick={() => void window.health.sync.now()}
        disabled={status.state === "syncing" || status.state === "paused"}
        className="rounded-md border border-border px-2 py-1 font-medium text-text hover:bg-surface-2 disabled:opacity-40"
      >
        {status.state === "syncing" ? <Spinner /> : "Sync now"}
      </button>
    </div>
  );
}

export function FirstSyncBanner({ status }: { status: SyncStatus | null }) {
  if (!status?.isFirstSync || status.state !== "syncing") return null;
  const pct = status.progress ? Math.round(((status.progress.done + 0.5) / status.progress.total) * 100) : 5;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-sm font-medium">Downloading your last {status.backfillDays} days from Google Health…</div>
      <div className="mt-1 text-xs text-muted">This takes a minute the first time. After that, the app keeps itself up to date while it is open.</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
