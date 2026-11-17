// Everything about the Google login in the UI:
// - Setup screen when no OAuth client exists yet
// - A reconnect dialog when Google rejects the login (weekly expiry, revoked, wrong account)
// - A banner when the login expires within a day

import { useState } from "react";
import type { AuthStatus } from "@shared/types";

export function Button({ children, onClick, variant = "primary", disabled }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger"; disabled?: boolean }) {
  const styles = {
    primary: "bg-accent text-white hover:brightness-110 dark:text-black",
    ghost: "border border-border bg-surface hover:bg-surface-2",
    danger: "border border-border bg-surface text-danger hover:bg-surface-2",
  }[variant];
  return (
    <button onClick={onClick} disabled={disabled} className={`no-drag inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 ${styles}`}>
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/** Full-screen setup page: nothing to show until a client exists. */
export function SetupScreen({ status }: { status: AuthStatus }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-lg rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-4 text-3xl">⌚️</div>
        <h1 className="text-xl font-semibold">Connect your Fitbit</h1>
        <p className="mt-2 text-sm text-muted">{status.message}</p>
        <ol className="mt-5 space-y-3 text-sm">
          <li><b>Own app (recommended):</b> open this project in Claude Code and say <code className="rounded bg-surface-2 px-1.5 py-0.5">connect my Fitbit</code>. It guides you through it in about 15 minutes.</li>
          <li><b>A shared app from your team (if you have one):</b> send your admin the Google email you use in the Google Health app. When they confirm, import the client file they send you.</li>
        </ol>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={() => void window.health.auth.importClient()}>Import client file…</Button>
          <Button variant="ghost" onClick={() => void window.health.auth.status()}>I set it up, check again</Button>
        </div>
      </div>
    </div>
  );
}

/** Modal shown on top of the dashboard (the data stays visible behind it). */
export function ReconnectDialog({ status, onLater }: { status: AuthStatus; onLater: () => void }) {
  const loggingIn = status.state === "logging_in";
  const wrongAccount = status.state === "account_not_linked";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 shadow-xl">
        <h2 className="text-lg font-semibold">{loggingIn ? "Waiting for your browser…" : wrongAccount ? "Wrong Google account" : "Reconnect Google Health"}</h2>
        <p className="mt-2 text-sm text-muted">{status.message}</p>
        {loggingIn ? (
          <ul className="mt-4 space-y-1.5 text-sm text-muted">
            <li>1. If you see <i>"Google hasn't verified this app"</i>, click <b>Continue</b>. It is your own app.</li>
            <li>2. Tick <b>Select all</b> (or keep the boxes ticked) and click <b>Continue</b>.</li>
            <li>3. Come back here. Syncing starts by itself.</li>
          </ul>
        ) : (
          status.loginHint && (
            <p className="mt-3 text-sm text-muted">
              Log in with <b className="text-text">{status.loginHint}</b>.
            </p>
          )
        )}
        <div className="mt-6 flex justify-end gap-2">
          {loggingIn ? (
            <Button variant="ghost" onClick={() => void window.health.auth.cancelLogin()}>Cancel</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onLater}>Later</Button>
              <Button onClick={() => void window.health.auth.login()}>Reconnect</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthBanner({ status, onOpen }: { status: AuthStatus; onOpen: () => void }) {
  const urgent = status.state !== "expiring";
  return (
    <div className={`no-drag flex items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-sm ${urgent ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted"}`}>
      <span>{status.message}</span>
      <button className="shrink-0 font-semibold underline-offset-2 hover:underline" onClick={urgent ? onOpen : () => void window.health.auth.login()}>
        Reconnect now
      </button>
    </div>
  );
}

/** Decides which auth UI to show. Returns the setup screen instead of children when needed. */
export function AuthGate({ status, children }: { status: AuthStatus | null; children: React.ReactNode }) {
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  if (!status || status.state === "checking") return <>{children}</>;
  if (status.state === "needs_setup") return <SetupScreen status={status} />;

  const needsAction = status.state === "needs_login" || status.state === "account_not_linked" || status.state === "logging_in";
  const showDialog = needsAction && (status.state === "logging_in" || dismissedFor !== status.state);
  return (
    <>
      {children}
      {showDialog && <ReconnectDialog status={status} onLater={() => setDismissedFor(status.state)} />}
      {(needsAction && !showDialog) || status.state === "expiring" ? (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[90%]">
          <AuthBanner status={status} onOpen={() => setDismissedFor(null)} />
        </div>
      ) : null}
    </>
  );
}
