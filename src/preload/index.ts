// The bridge between the UI and the main process. The UI sees this as window.health.
// Keep it thin: every function maps to one ipcMain.handle in src/main/index.ts.

import { contextBridge, ipcRenderer } from "electron";
import type { HealthBridge } from "@shared/types";

const on = (channel: string) => (cb: (payload: any) => void) => {
  const listener = (_e: unknown, payload: any) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const health: HealthBridge = {
  auth: {
    status: () => ipcRenderer.invoke("auth:status"),
    login: () => ipcRenderer.invoke("auth:login"),
    cancelLogin: () => ipcRenderer.invoke("auth:cancel-login"),
    logout: () => ipcRenderer.invoke("auth:logout"),
    importClient: () => ipcRenderer.invoke("auth:import-client"),
    onStatus: on("auth:status"),
  },
  sync: {
    status: () => ipcRenderer.invoke("sync:status"),
    now: () => ipcRenderer.invoke("sync:now"),
    setInterval: (minutes) => ipcRenderer.invoke("sync:set-interval", minutes),
    streams: () => ipcRenderer.invoke("sync:streams"),
    onStatus: on("sync:status"),
  },
  data: {
    daily: (metrics, from, to) => ipcRenderer.invoke("data:daily", metrics, from, to),
    points: (type, from, to) => ipcRenderer.invoke("data:points", type, from, to),
    sleepSessions: (from, to) => ipcRenderer.invoke("data:sleep", from, to),
    devices: () => ipcRenderer.invoke("data:devices"),
    sql: (query, params) => ipcRenderer.invoke("data:sql", query, params ?? []),
    onChanged: on("data:changed"),
  },
  app: {
    info: () => ipcRenderer.invoke("app:info"),
    openDataFolder: () => ipcRenderer.invoke("app:open-data-folder"),
  },
};

contextBridge.exposeInMainWorld("health", health);
