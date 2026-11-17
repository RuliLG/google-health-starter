import type { AppInfo, AuthStatus, StreamStatus, SyncStatus } from "@shared/types";
import { ago } from "../lib/format";
import { useHealthData } from "../lib/hooks";
import { Button } from "./AuthPrompt";

export function Settings({ auth, sync, onClose }: { auth: AuthStatus | null; sync: SyncStatus | null; onClose: () => void }) {
  const { data: streams } = useHealthData<StreamStatus[]>(() => window.health.sync.streams(), [sync?.lastRunAt]);
  const { data: info } = useHealthData<AppInfo>(() => window.health.app.info(), []);

  return (
    <div className="fixed inset-0 z-[45] flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button className="text-sm text-muted hover:text-text" onClick={onClose}>Close</button>
        </div>

        <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Google account</h3>
        <div className="space-y-1 text-sm">
          <div>Status: <b>{auth?.state.replace("_", " ")}</b>{auth?.loginHint && <> · {auth.loginHint}</>}</div>
          {auth?.reloginInDays != null && (
            <div className="text-muted">
              Google asks for a new login in about{" "}
              {auth.reloginInDays >= 1 ? `${Math.round(auth.reloginInDays)} days` : `${Math.max(1, Math.round(auth.reloginInDays * 24))} hours`} (personal apps in "Testing" mode).
            </div>
          )}
          <div className="text-muted">App: {auth?.clientSource === "shared-app" ? "a shared app from your team" : "your own Google Cloud app"} · {auth?.scopes.length ?? 0} data permissions</div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" onClick={() => void window.health.auth.login()}>Reconnect</Button>
          <Button variant="danger" onClick={() => { if (confirm("Disconnect Google Health? Your local data stays; syncing stops until you reconnect.")) void window.health.auth.logout(); }}>Disconnect</Button>
        </div>

        <h3 className="mt-8 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Sync</h3>
        <label className="flex items-center gap-3 text-sm">
          Sync every
          <select className="rounded-md border border-border bg-surface px-2 py-1" value={sync?.intervalMinutes ?? 15} onChange={(e) => void window.health.sync.setInterval(Number(e.target.value))}>
            {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
          while the app is open
        </label>
        <p className="mt-1 text-xs text-muted">The app also syncs at start, after your computer wakes up, and when you come back to the window. If your watch has not synced to Google since the last run, it skips the heavy work.</p>

        <h3 className="mt-8 mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Data on this computer</h3>
        <table className="w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="py-1 font-medium">Data</th><th className="font-medium">Rows</th><th className="font-medium">Since</th><th className="font-medium">Last sync</th></tr></thead>
          <tbody>
            {streams?.map((s) => (
              <tr key={s.stream} className="border-t border-border">
                <td className="py-1.5">{s.label}{s.lastError && <div className="text-danger" title={s.lastError}>{s.lastErrorCode === "PERMISSION_DENIED" ? "No permission: tick it at the next reconnect" : s.lastError.slice(0, 80)}</div>}</td>
                <td className="tabular">{s.totalRows.toLocaleString()}</td>
                <td className="tabular">{s.syncedFrom ?? "–"}</td>
                <td>{ago(s.lastSuccessAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 space-y-1 text-xs text-muted">
          <div>Database: <code className="break-all">{info?.dbPath}</code></div>
          <div>Login files: <code className="break-all">{info?.configDir}</code></div>
        </div>
        <div className="mt-3"><Button variant="ghost" onClick={() => void window.health.app.openDataFolder()}>Open data folder</Button></div>
      </aside>
    </div>
  );
}
