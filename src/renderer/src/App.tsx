import { useState } from "react";
import { AuthGate } from "./components/AuthPrompt";
import { Dashboard } from "./components/Dashboard";
import { Settings } from "./components/Settings";
import { FirstSyncBanner, SyncIndicator } from "./components/SyncIndicator";
import { useAuth, useSync } from "./lib/hooks";

export default function App() {
  const auth = useAuth();
  const sync = useSync();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <AuthGate status={auth}>
      <div className="flex h-full flex-col">
        <header className="drag flex h-14 shrink-0 items-center justify-between border-b border-border pr-5 pl-24">
          <div className="text-sm font-semibold">Health</div>
          <div className="flex items-center gap-4">
            <SyncIndicator status={sync} />
            <button className="no-drag text-xs text-muted hover:text-text" onClick={() => setSettingsOpen(true)}>Settings</button>
          </div>
        </header>
        <main className="flex-1 space-y-4 overflow-y-auto p-6">
          <FirstSyncBanner status={sync} />
          <Dashboard />
        </main>
      </div>
      {settingsOpen && <Settings auth={auth} sync={sync} onClose={() => setSettingsOpen(false)} />}
    </AuthGate>
  );
}
