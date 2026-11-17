// Types shared by the main process, the preload bridge and the UI.

export type AuthState =
  | "checking"
  | "connected"
  | "expiring" // connected, but Google will ask for a new login within a day (Testing-mode apps)
  | "needs_login" // no token, or Google rejected the refresh token
  | "needs_setup" // no OAuth client yet: run the google-health-connect skill in Claude Code
  | "account_not_linked" // logged in with a Google account that has no Google Health data
  | "logging_in";

export interface AuthStatus {
  state: AuthState;
  message: string;
  loginHint: string | null;
  reloginInDays: number | null;
  scopes: string[];
  clientSource: string | null;
}

export type SyncState = "idle" | "syncing" | "paused" | "offline" | "error";

export interface StreamStatus {
  stream: string;
  label: string;
  lastSuccessAt: string | null;
  syncedFrom: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  rowsLastRun: number;
  totalRows: number;
}

export interface SyncStatus {
  state: SyncState;
  trigger: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  intervalMinutes: number;
  backfillDays: number;
  progress: { stream: string; label: string; done: number; total: number } | null;
  lastError: string | null;
  deviceLastSyncTime: string | null;
  isFirstSync: boolean;
}

export interface DailyRow {
  date: string; // YYYY-MM-DD, the person's local day
  metric: DailyMetric;
  value: number | null;
}

/** Metrics in the daily_metrics table (one value per local day). */
export type DailyMetric =
  | "steps"
  | "distance_m"
  | "calories_kcal"
  | "active_minutes"
  | "active_zone_minutes"
  | "floors"
  | "sedentary_minutes"
  | "heart_rate_avg"
  | "resting_hr"
  | "hrv_ms"
  | "spo2_avg"
  | "sleep_minutes";

export interface PointRow {
  type: string;
  id: string;
  startUtc: string | null;
  endUtc: string | null;
  localDate: string | null;
  localStart: string | null;
  value: number | null;
  payload: any;
}

export interface SleepSession {
  id: string;
  localDate: string; // wake-up day
  startUtc: string;
  endUtc: string;
  minutesAsleep: number | null;
  minutesAwake: number | null;
  stages: { type: string; minutes: number }[];
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: string | null;
  batteryLevel: number | null;
  lastSyncTime: string | null;
}

export interface AppInfo {
  dbPath: string;
  configDir: string;
  version: string;
}

/** The API exposed to the UI as window.health (see src/preload/index.ts). */
export interface HealthBridge {
  auth: {
    status(): Promise<AuthStatus>;
    login(): Promise<AuthStatus>;
    cancelLogin(): Promise<void>;
    logout(): Promise<AuthStatus>;
    importClient(): Promise<AuthStatus>;
    onStatus(cb: (s: AuthStatus) => void): () => void;
  };
  sync: {
    status(): Promise<SyncStatus>;
    now(): Promise<SyncStatus>;
    setInterval(minutes: number): Promise<SyncStatus>;
    streams(): Promise<StreamStatus[]>;
    onStatus(cb: (s: SyncStatus) => void): () => void;
  };
  data: {
    daily(metrics: DailyMetric[], from: string, to: string): Promise<DailyRow[]>;
    points(type: string, from: string, to: string): Promise<PointRow[]>;
    sleepSessions(from: string, to: string): Promise<SleepSession[]>;
    devices(): Promise<DeviceInfo[]>;
    /** Read-only SQL for quick experiments (SELECT/WITH only). */
    sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
    onChanged(cb: () => void): () => void;
  };
  app: {
    info(): Promise<AppInfo>;
    openDataFolder(): Promise<void>;
  };
}
