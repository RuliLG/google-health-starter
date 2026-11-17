// Types for google-health.mjs (so TypeScript apps can import it).

export const API_BASE: string;
export const READ_SCOPES: string[];
export const WRITE_SCOPES: string[];

export type GoogleHealthErrorCode =
  | "NO_CLIENT" | "BAD_CLIENT" | "NO_TOKEN" | "REAUTH_REQUIRED" | "ACCOUNT_NOT_LINKED"
  | "PERMISSION_DENIED" | "NETWORK" | "HTTP" | "TIMEOUT" | "CANCELLED" | "AUTH_DENIED" | "STATE";

export class GoogleHealthError extends Error {
  code?: GoogleHealthErrorCode;
  status?: number;
  details?: unknown;
}

export interface ClientInfo {
  client_id: string;
  client_secret: string;
  client_type: "desktop" | "web";
  redirect_uri?: string;
  source?: string;
}

export interface TokenStatus {
  connected: boolean;
  invalidSince: string | null;
  accessTokenSecondsLeft: number;
  hasRefreshToken: boolean;
  consentAgeDays: number | null;
  reloginInDays: number | null;
  scopes: string[];
  loginHint: string | null;
}

export function configDir(): string;
export function loadClient(): ClientInfo;
export function importClient(srcFile: string, opts?: { source?: string }): ClientInfo;
export function importClientFromText(text: string, opts?: { source?: string; clientType?: "desktop" | "web"; redirectUri?: string }): ClientInfo;
export function loadToken(): Record<string, unknown>;
export function invalidateAccessToken(): void;
export function getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>;
export function tokenStatus(): TokenStatus;
export function login(opts?: {
  scopes?: string[];
  loginHint?: string;
  openBrowser?: boolean;
  onAuthUrl?: (url: string) => void;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<TokenStatus>;
export function logout(): Promise<void>;
export function api<T = any>(method: string, path: string, opts?: { params?: Record<string, unknown>; body?: unknown; retries?: number }): Promise<T>;
export function listDataPoints(dataType: string, opts?: { filter?: string; all?: boolean; pageSize?: number; maxPages?: number }): Promise<{ dataPoints: any[]; nextPageToken: string | null }>;
export function dailyRollUp(dataType: string, start: string, end: string, opts?: { windowSizeDays?: number }): Promise<{ rollupDataPoints?: any[] }>;
export function rollUp(dataType: string, startTime: string, endTime: string, windowSize?: string): Promise<any[]>;
export function doctor(): Promise<{ name: string; ok: boolean; info: string }[]>;
