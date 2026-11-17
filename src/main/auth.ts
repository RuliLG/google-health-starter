// Tracks whether the Google Health login is usable, and runs the (re)login flow from the app.
// Any API error goes through reportError(), so an expired login anywhere flips the UI to "reconnect".

import { EventEmitter } from "node:events";
import { BrowserWindow, Notification, dialog, shell } from "electron";
import * as gh from "@gh";
import type { AuthStatus } from "@shared/types";

const EXPIRING_DAYS = 1; // warn when Google will ask for a new login within this many days

export class AuthManager extends EventEmitter {
  private status: AuthStatus = { state: "checking", message: "Checking your Google Health login…", loginHint: null, reloginInDays: null, scopes: [], clientSource: null };
  private loginAbort: AbortController | null = null;
  private loginPromise: Promise<AuthStatus> | null = null;

  get current(): AuthStatus {
    return this.status;
  }

  /** True when API calls are expected to work. */
  get usable(): boolean {
    return this.status.state === "connected" || this.status.state === "expiring";
  }

  /** Local check only (no network). Call at startup and before each sync. */
  check(): AuthStatus {
    if (this.status.state === "logging_in" || this.status.state === "account_not_linked") return this.status;
    let clientSource: string | null = null;
    try {
      clientSource = gh.loadClient().source ?? null;
    } catch {
      return this.set({ state: "needs_setup", message: "Google Health is not set up on this computer yet. Open this project in Claude Code and say \"connect my Fitbit\", or import a client file from your team admin." });
    }
    let t: gh.TokenStatus;
    try {
      t = gh.tokenStatus();
    } catch {
      return this.set({ state: "needs_login", message: "Connect your Google Health account to start syncing.", clientSource });
    }
    const base = { loginHint: t.loginHint, reloginInDays: t.reloginInDays, scopes: t.scopes, clientSource };
    if (!t.connected || !t.hasRefreshToken) {
      return this.set({ ...base, state: "needs_login", message: "Google asked you to log in again (this happens every 7 days for personal apps). Your data is safe; syncing is paused until you reconnect." });
    }
    // Testing-mode apps: the refresh token dies 7 days after consent. This is only a prediction for the
    // banner; the login is marked dead only when Google actually rejects it (reportError). If the token
    // still works a day after the predicted expiry, the app is probably published (no expiry): stop warning.
    if (t.reloginInDays != null && t.reloginInDays <= EXPIRING_DAYS && t.reloginInDays > -1) {
      const hours = Math.round(t.reloginInDays * 24);
      const message = hours > 0
        ? `Google will ask you to log in again in about ${hours} h. Reconnect now to avoid a gap.`
        : "Google may ask you to log in again at any moment (weekly limit). Reconnect now to avoid a gap.";
      return this.set({ ...base, state: "expiring", message });
    }
    return this.set({ ...base, state: "connected", message: "Connected to Google Health." });
  }

  /** Map an error from the API layer to an auth state. Returns true if it was an auth problem. */
  reportError(err: unknown): boolean {
    const code = (err as gh.GoogleHealthError)?.code;
    if (code === "REAUTH_REQUIRED" || code === "NO_TOKEN") {
      const s = this.check(); // token.json now carries invalid_at, so check() says needs_login
      if (s.state !== "needs_login") this.set({ state: "needs_login", message: "Google no longer accepts this login. Reconnect to keep syncing." });
      return true;
    }
    if (code === "ACCOUNT_NOT_LINKED") {
      this.set({ state: "account_not_linked", message: "You logged in with a Google account that has no Fitbit data. Reconnect and pick the Google account you use in the Google Health app." });
      return true;
    }
    if (code === "NO_CLIENT") {
      this.check();
      return true;
    }
    return false;
  }

  /** Opens Google's consent page in the default browser and waits for the redirect. */
  login(): Promise<AuthStatus> {
    if (this.loginPromise) return this.loginPromise;
    const previous = this.status;
    this.loginAbort = new AbortController();
    this.set({ ...previous, state: "logging_in", message: "Finish the login in your browser. Pick the Google account you use in the Google Health app." });

    const p: Promise<AuthStatus> = gh
      .login({
        loginHint: previous.loginHint ?? undefined,
        openBrowser: false,
        onAuthUrl: (url) => void shell.openExternal(url),
        signal: this.loginAbort.signal,
      })
      .then(() => {
        this.status = { ...this.status, state: "checking" };
        const s = this.check();
        BrowserWindow.getAllWindows()[0]?.focus();
        this.emit("connected");
        return s;
      })
      .catch((e: gh.GoogleHealthError) => {
        if (e.code === "CANCELLED") return this.set(previous.state === "logging_in" ? { ...previous, state: "needs_login" } : previous);
        return this.set({ ...previous, state: previous.state === "connected" ? "needs_login" : previous.state, message: `Login did not finish: ${e.message}` });
      })
      .finally(() => {
        this.loginPromise = null;
        this.loginAbort = null;
      });
    this.loginPromise = p;
    return p;
  }

  cancelLogin() {
    this.loginAbort?.abort();
  }

  async logout(): Promise<AuthStatus> {
    await gh.logout();
    this.status = { ...this.status, state: "checking" };
    return this.check();
  }

  /** For shared-app users: pick the client JSON received from the team admin. */
  async importClient(win?: BrowserWindow): Promise<AuthStatus> {
    const res = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: "Choose the Google Health client file (JSON)",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths[0]) return this.status;
    gh.importClient(res.filePaths[0], { source: "shared-app" });
    this.status = { ...this.status, state: "checking" };
    return this.check();
  }

  private set(partial: Partial<AuthStatus> & Pick<AuthStatus, "state" | "message">): AuthStatus {
    const prev = this.status.state;
    this.status = { ...this.status, ...partial };
    if (prev !== this.status.state) {
      this.emit("status", this.status);
      this.notifyIfNeeded(prev);
    }
    return this.status;
  }

  // A system notification, so people notice even when the window is in the background.
  private notifyIfNeeded(prev: string) {
    const s = this.status.state;
    if (prev === "checking" || !Notification.isSupported()) return;
    if (s === "needs_login" || s === "account_not_linked" || (s === "expiring" && prev === "connected")) {
      const n = new Notification({ title: s === "expiring" ? "Google Health login expires soon" : "Reconnect Google Health", body: this.status.message });
      n.on("click", () => BrowserWindow.getAllWindows()[0]?.show());
      n.show();
    }
  }
}
