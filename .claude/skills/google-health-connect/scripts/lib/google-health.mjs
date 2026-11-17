// Google Health API client: OAuth (loopback + PKCE), token refresh, REST calls.
// Node >= 18, zero dependencies. Shared by the CLI (../gh.mjs) and by apps built on this template.
//
// Files live in GOOGLE_HEALTH_DIR (default ~/.config/google-health), both mode 0600:
//   client.json  { client_id, client_secret, client_type: "desktop"|"web", redirect_uri? , source }
//   token.json   { access_token, refresh_token, expires_at, obtained_at, scope, ... }

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

export const API_BASE = "https://health.googleapis.com/v4/";
const AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const REVOKE_URI = "https://oauth2.googleapis.com/revoke";

const SCOPE_PREFIX = "https://www.googleapis.com/auth/googlehealth.";
export const READ_SCOPES = [
  "activity_and_fitness", "health_metrics_and_measurements", "sleep", "nutrition",
  "profile", "settings", "ecg", "irn", "location",
].map((s) => `${SCOPE_PREFIX}${s}.readonly`);
export const WRITE_SCOPES = [
  "activity_and_fitness", "health_metrics_and_measurements", "sleep", "nutrition",
  "profile", "settings", "logged_symptoms", "mindfulness", "reproductive_health",
].map((s) => `${SCOPE_PREFIX}${s}.writeonly`);

export class GoogleHealthError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.code = code; // e.g. NO_CLIENT, NO_TOKEN, REAUTH_REQUIRED, ACCOUNT_NOT_LINKED, HTTP
    this.status = status;
    this.details = details;
  }
}

export function configDir() {
  const d = process.env.GOOGLE_HEALTH_DIR || path.join(os.homedir(), ".config", "google-health");
  return d.replace(/^~(?=$|\/)/, os.homedir());
}
const clientFile = () => path.join(configDir(), "client.json");
const tokenFile = () => path.join(configDir(), "token.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
}

// ---------- client ----------

export function loadClient() {
  if (!fs.existsSync(clientFile())) {
    throw new GoogleHealthError(`No OAuth client at ${clientFile()}. Run: gh.mjs import-client <file>`, { code: "NO_CLIENT" });
  }
  const c = readJson(clientFile());
  c.client_type ||= c.redirect_uri ? "web" : "desktop";
  return c;
}

/**
 * Accepts Google's downloaded client file ({"installed":{...}} or {"web":{...}})
 * or a flat {client_id, client_secret, ...} object, and stores it normalized.
 */
export function importClient(srcFile, { source = "own-project" } = {}) {
  const raw = readJson(srcFile);
  const inner = raw.installed || raw.web || raw;
  const clientType = raw.web ? "web" : raw.installed ? "desktop" : raw.client_type || "desktop";
  if (!inner.client_id || !inner.client_secret) {
    throw new GoogleHealthError("File has no client_id/client_secret.", { code: "BAD_CLIENT" });
  }
  const client = {
    client_id: inner.client_id,
    client_secret: inner.client_secret,
    client_type: clientType,
    source: raw.source || source,
  };
  if (clientType === "web") {
    client.redirect_uri = raw.redirect_uri || (inner.redirect_uris || [])[0];
    if (!client.redirect_uri) throw new GoogleHealthError("Web client needs a redirect URI.", { code: "BAD_CLIENT" });
  }
  writePrivate(clientFile(), client);
  return { ...client, client_secret: "<hidden>" };
}

/**
 * Extracts client_id + client_secret from free text (e.g. the Cloud Console "OAuth client created"
 * dialog read with `agent-browser get text body`) and stores it. Lets an agent save the secret
 * without ever printing it.
 */
export function importClientFromText(text, { source = "own-project", clientType = "desktop", redirectUri } = {}) {
  const id = text.match(/\d+-[a-z0-9]+\.apps\.googleusercontent\.com/)?.[0];
  const secret = text.match(/GOCSPX-[A-Za-z0-9_-]+/)?.[0];
  if (!id || !secret) {
    throw new GoogleHealthError("Could not find a client ID and secret in the text. Is the 'OAuth client created' dialog still open?", { code: "BAD_CLIENT" });
  }
  const client = { client_id: id, client_secret: secret, client_type: clientType, source };
  if (clientType === "web") client.redirect_uri = redirectUri;
  writePrivate(clientFile(), client);
  return { ...client, client_secret: "<hidden>" };
}

// ---------- tokens ----------

export function loadToken() {
  if (!fs.existsSync(tokenFile())) {
    throw new GoogleHealthError("Not connected yet. Run: gh.mjs login", { code: "NO_TOKEN" });
  }
  return readJson(tokenFile());
}

async function postForm(url, fields) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  } catch (e) {
    throw new GoogleHealthError(`Network error talking to Google: ${e.cause?.code || e.message}`, { code: "NETWORK" });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (body.error === "invalid_grant") {
      throw new GoogleHealthError(
        "Google rejected the refresh token. In Testing mode it expires after 7 days (or access was revoked). Run: gh.mjs login",
        { code: "REAUTH_REQUIRED", status: res.status, details: body },
      );
    }
    throw new GoogleHealthError(`Token endpoint error ${res.status}: ${body.error || ""} ${body.error_description || ""}`.trim(), {
      code: "HTTP", status: res.status, details: body,
    });
  }
  return body;
}

/** Forces the next getAccessToken() to refresh (used after a 401). */
export function invalidateAccessToken() {
  try {
    const tok = loadToken();
    writePrivate(tokenFile(), { ...tok, expires_at: 0 });
  } catch { /* no token */ }
}

let refreshing = null; // dedupe concurrent refreshes

export async function getAccessToken({ forceRefresh = false } = {}) {
  const tok = loadToken();
  if (!forceRefresh && tok.expires_at && tok.expires_at > Date.now() / 1000) return tok.access_token;
  refreshing ||= refreshAccessToken(tok).finally(() => { refreshing = null; });
  return refreshing;
}

async function refreshAccessToken(tok) {
  if (!tok.refresh_token) {
    throw new GoogleHealthError("Access token expired and there is no refresh token. Run: gh.mjs login", { code: "REAUTH_REQUIRED" });
  }
  if (tok.invalid_at) {
    throw new GoogleHealthError("This login was rejected by Google earlier. Run: gh.mjs login", { code: "REAUTH_REQUIRED" });
  }
  const client = loadClient();
  let fresh;
  try {
    fresh = await postForm(TOKEN_URI, {
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    });
  } catch (e) {
    // Remember a dead refresh token so apps can show "reconnect" at startup without a network call.
    if (e.code === "REAUTH_REQUIRED") writePrivate(tokenFile(), { ...tok, invalid_at: Math.floor(Date.now() / 1000) });
    throw e;
  }
  const merged = { ...tok, ...fresh, expires_at: Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600) - 60 };
  writePrivate(tokenFile(), merged);
  return merged.access_token;
}

export function tokenStatus() {
  const tok = loadToken();
  const now = Date.now() / 1000;
  const consentAgeDays = tok.obtained_at ? (now - tok.obtained_at) / 86400 : null;
  return {
    connected: !tok.invalid_at,
    invalidSince: tok.invalid_at ? new Date(tok.invalid_at * 1000).toISOString() : null,
    accessTokenSecondsLeft: Math.max(0, Math.round((tok.expires_at || 0) - now)),
    hasRefreshToken: Boolean(tok.refresh_token),
    consentAgeDays: consentAgeDays == null ? null : Number(consentAgeDays.toFixed(1)),
    // Testing-mode apps: refresh tokens die 7 days after consent.
    reloginInDays: consentAgeDays == null ? null : Number((7 - consentAgeDays).toFixed(1)),
    scopes: (tok.scope || "").split(" ").filter((s) => s.startsWith(SCOPE_PREFIX)).map((s) => s.replace(SCOPE_PREFIX, "")),
    loginHint: tok.login_hint || null,
  };
}

// ---------- login ----------

function openUrl(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  execFile(cmd, [url], () => {});
}

/**
 * Runs the OAuth authorization-code flow with PKCE and a loopback redirect.
 * onAuthUrl(url) is called with the consent URL (print it, or open it in a controlled browser).
 */
export async function login({ scopes = READ_SCOPES, loginHint, openBrowser = true, onAuthUrl, timeoutMs = 10 * 60 * 1000, signal } = {}) {
  const client = loadClient();
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(18).toString("base64url");

  let host = "127.0.0.1";
  let port = 0; // desktop clients accept any loopback port
  let cbPath = "/";
  if (client.client_type === "web") {
    const u = new URL(client.redirect_uri);
    host = u.hostname === "localhost" ? "127.0.0.1" : u.hostname;
    port = Number(u.port || 80);
    cbPath = u.pathname;
  }

  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const redirectUri = client.client_type === "web" ? client.redirect_uri : `http://127.0.0.1:${server.address().port}/`;

  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    // openid + email give us the account email, so later re-logins can pre-select the right account.
    scope: [...new Set(["openid", "email", ...scopes])].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (loginHint) params.set("login_hint", loginHint);
  const authUrl = `${AUTH_URI}?${params}`;

  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new GoogleHealthError("Timed out waiting for Google to redirect back.", { code: "TIMEOUT" })), timeoutMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new GoogleHealthError("Login cancelled.", { code: "CANCELLED" }));
    }, { once: true });
    server.on("request", (req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.pathname !== cbPath) { res.writeHead(404).end(); return; }
      const q = Object.fromEntries(u.searchParams);
      const ok = q.code && q.state === state;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body style="font-family:system-ui;padding:3rem"><h2>${ok ? "Google Health connected. You can close this tab." : `Connection failed: ${q.error || "state mismatch"}`}</h2></body></html>`);
      clearTimeout(timer);
      if (q.error) reject(new GoogleHealthError(`Authorization error: ${q.error}`, { code: "AUTH_DENIED" }));
      else if (q.state !== state) reject(new GoogleHealthError("State mismatch.", { code: "STATE" }));
      else resolve(q);
    });
    onAuthUrl?.(authUrl);
    if (openBrowser) openUrl(authUrl);
  }).finally(() => server.close());

  const tok = await postForm(TOKEN_URI, {
    code: result.code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const now = Math.floor(Date.now() / 1000);
  const email = emailFromIdToken(tok.id_token);
  delete tok.id_token; // not needed after we read the email
  writePrivate(tokenFile(), { ...tok, expires_at: now + (tok.expires_in || 3600) - 60, obtained_at: now, login_hint: email || loginHint || null });
  return tokenStatus();
}

function emailFromIdToken(idToken) {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).email || null;
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    const tok = loadToken();
    const t = tok.refresh_token || tok.access_token;
    if (t) await fetch(`${REVOKE_URI}?token=${encodeURIComponent(t)}`, { method: "POST" });
  } catch { /* already gone */ }
  fs.rmSync(tokenFile(), { force: true });
}

// ---------- REST ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the REST API. Retries 429/5xx/network errors with backoff, refreshes the token once on 401.
 * Error codes: REAUTH_REQUIRED, ACCOUNT_NOT_LINKED, PERMISSION_DENIED (scope not granted), NETWORK, HTTP.
 */
export async function api(method, apiPath, { params, body, retries = 3 } = {}) {
  const url = new URL(apiPath.replace(/^\//, ""), API_BASE);
  for (const [k, v] of Object.entries(params || {})) if (v != null) url.searchParams.set(k, String(v));
  let refreshedAfter401 = false;

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${await getAccessToken()}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      if (e instanceof GoogleHealthError) throw e; // auth/refresh problems
      if (attempt < retries) { await sleep(1000 * 2 ** attempt); continue; }
      throw new GoogleHealthError(`Network error: ${e.cause?.code || e.message}`, { code: "NETWORK" });
    }

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
    if (res.ok) return data;

    if (res.status === 401 && !refreshedAfter401) {
      // Access token revoked or stale: refresh once. If the refresh token is dead, this throws REAUTH_REQUIRED.
      refreshedAfter401 = true;
      await getAccessToken({ forceRefresh: true });
      attempt = -1;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
      continue;
    }

    const msg = data.error?.message || text.slice(0, 500);
    const blob = JSON.stringify(data);
    if (blob.includes("ACCOUNT_NOT_LINKED")) {
      throw new GoogleHealthError("This Google account has no Google Health data linked. Set up the Fitbit in the Google Health app with this same Google account.", { code: "ACCOUNT_NOT_LINKED", status: res.status, details: data });
    }
    if (res.status === 401) {
      throw new GoogleHealthError("Google no longer accepts this login. Run: gh.mjs login", { code: "REAUTH_REQUIRED", status: 401, details: data });
    }
    if (res.status === 403) {
      throw new GoogleHealthError(`No permission for ${url.pathname} (scope not granted at consent?): ${msg}`, { code: "PERMISSION_DENIED", status: 403, details: data });
    }
    throw new GoogleHealthError(`HTTP ${res.status} ${method} ${url.pathname}: ${msg}`, { code: "HTTP", status: res.status, details: data });
  }
}

/** Intraday rollup over a UTC range, e.g. heart-rate in 300s windows. Max 14 days for heart-rate. */
export async function rollUp(dataType, startTime, endTime, windowSize = "300s") {
  const out = [];
  let pageToken;
  do {
    const page = await api("POST", `users/me/dataTypes/${dataType}/dataPoints:rollUp`, {
      body: { range: { startTime, endTime }, windowSize, pageSize: 10000, ...(pageToken ? { pageToken } : {}) },
    });
    out.push(...(page.rollupDataPoints || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/** List data points of one type. Follows pages when all=true (pages can be empty yet carry a nextPageToken). */
export async function listDataPoints(dataType, { filter, all = false, pageSize = 1000, maxPages = 50 } = {}) {
  const points = [];
  let pageToken;
  for (let i = 0; i < maxPages; i++) {
    const page = await api("GET", `users/me/dataTypes/${dataType}/dataPoints`, { params: { filter, pageSize, pageToken } });
    points.push(...(page.dataPoints || []));
    pageToken = page.nextPageToken;
    if (!pageToken || (!all && points.length)) break;
  }
  return { dataPoints: points, nextPageToken: pageToken || null };
}

const civilDate = (iso) => {
  const [year, month, day] = iso.split("-").map(Number);
  return { date: { year, month, day } };
};

/** Daily aggregates. start inclusive, end exclusive, YYYY-MM-DD. Max 90 days (14 for heart-rate, total-calories, active-minutes, calories-in-heart-rate-zone). */
export async function dailyRollUp(dataType, start, end, { windowSizeDays } = {}) {
  return api("POST", `users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    body: { range: { start: civilDate(start), end: civilDate(end) }, ...(windowSizeDays ? { windowSizeDays } : {}) },
  });
}

/** End-to-end health check. Never throws; returns a list of checks. */
export async function doctor() {
  const checks = [];
  const add = (name, ok, info) => checks.push({ name, ok, info });
  try { const c = loadClient(); add("oauth client", true, `${c.client_type} client (${c.source || "unknown source"})`); }
  catch (e) { add("oauth client", false, e.message); return checks; }
  try { const s = tokenStatus(); add("token", s.hasRefreshToken && s.connected, s.invalidSince ? `rejected by Google since ${s.invalidSince}; run login` :`consent ${s.consentAgeDays} days old, re-login in ~${s.reloginInDays} days, ${s.scopes.length} scopes`); }
  catch (e) { add("token", false, e.message); return checks; }
  try { await getAccessToken(); add("refresh", true, "access token OK"); }
  catch (e) { add("refresh", false, e.message); return checks; }
  try { const id = await api("GET", "users/me/identity"); add("account linked", true, `healthUserId ${id.healthUserId}`); }
  catch (e) { add("account linked", false, e.message); return checks; }
  try {
    const d = await api("GET", "users/me/pairedDevices");
    const list = (d.pairedDevices || []).map((p) => `${p.deviceVersion} (battery ${p.batteryLevel ?? "?"}%, last sync ${p.lastSyncTime})`);
    add("devices", list.length > 0, list.join("; ") || "no paired devices; pair the Fitbit in the Google Health app");
  } catch (e) { add("devices", false, e.message); }
  return checks;
}
