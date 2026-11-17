// Electron main process: window, local database, Google Health auth, background sync, IPC.

import { app, BrowserWindow, ipcMain, powerMonitor, shell } from "electron";
import path from "node:path";
import * as gh from "@gh";
import { openDb, openReadOnly } from "./db";
import { AuthManager } from "./auth";
import { SyncEngine } from "./sync/engine";
import * as q from "./queries";

const dbPath = path.join(app.getPath("userData"), "health.sqlite");

// Opt-in: lets Claude Code inspect the running app (agent-browser --cdp <port>). Never on by default.
if (process.env.HEALTH_DEBUG_PORT) app.commandLine.appendSwitch("remote-debugging-port", process.env.HEALTH_DEBUG_PORT);
let win: BrowserWindow | null = null;

app.whenReady().then(() => {
  const db = openDb(dbPath);
  const ro = openReadOnly(dbPath);
  const auth = new AuthManager();
  const sync = new SyncEngine(db, auth);

  const send = (channel: string, payload?: unknown) => win?.webContents.send(channel, payload);
  auth.on("status", (s) => {
    send("auth:status", s);
    // Login became usable (in the app, or via the CLI and "check again"): resume a paused sync now.
    if ((s.state === "connected" || s.state === "expiring") && sync.current.state === "paused") void sync.runNow("auth", { force: true });
  });
  auth.on("connected", () => void sync.runNow("login"));
  sync.on("status", (s) => send("sync:status", s));
  sync.on("data-changed", () => send("data:changed"));

  // ---- IPC (the UI's only way in; see src/preload/index.ts) ----
  ipcMain.handle("auth:status", () => auth.check());
  ipcMain.handle("auth:login", () => auth.login());
  ipcMain.handle("auth:cancel-login", () => auth.cancelLogin());
  ipcMain.handle("auth:logout", async () => { sync.stop(); return auth.logout(); });
  ipcMain.handle("auth:import-client", async () => {
    const s = await auth.importClient(win ?? undefined);
    return s;
  });

  ipcMain.handle("sync:status", () => sync.current);
  ipcMain.handle("sync:now", async () => { await sync.runNow("manual"); return sync.current; });
  ipcMain.handle("sync:set-interval", (_e, min: number) => sync.setIntervalMinutes(min));
  ipcMain.handle("sync:streams", () => sync.streams());

  ipcMain.handle("data:daily", (_e, metrics, from, to) => q.daily(db, metrics, from, to));
  ipcMain.handle("data:points", (_e, type, from, to) => q.points(db, type, from, to));
  ipcMain.handle("data:sleep", (_e, from, to) => q.sleepSessions(db, from, to));
  ipcMain.handle("data:devices", () => q.devices(db));
  ipcMain.handle("data:sql", (_e, query: string, params?: unknown[]) => q.sql(ro, query, params));

  ipcMain.handle("app:info", () => ({ dbPath, configDir: gh.configDir(), version: app.getVersion() }));
  ipcMain.handle("app:open-data-folder", () => shell.openPath(path.dirname(dbPath)));

  // ---- triggers ----
  powerMonitor.on("resume", () => setTimeout(() => void sync.runNow("resume"), 10_000));

  createWindow(sync);
  auth.check();
  sync.start();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(sync);
  });
  app.on("before-quit", () => {
    sync.stop();
    auth.cancelLogin();
  });
});

function createWindow(sync: SyncEngine) {
  win = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Health",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#0b0d10",
    show: false,
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.once("ready-to-show", () => win?.show());
  win.on("focus", () => sync.onFocus());
  win.on("closed", () => { win = null; });
  // Links open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: "deny" }; });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
}

// Keep syncing while the app is open; on macOS closing the window keeps the app (and sync) alive.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
