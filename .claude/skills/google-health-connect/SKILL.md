---
name: google-health-connect
description: Connect a Fitbit (Fitbit Air, Pixel Watch, any Google Health device) to the Google Health API and read the person's health data — sleep, steps, heart rate, HRV, SpO2, exercise, calories, nutrition. Covers the whole setup (Google Cloud project, OAuth consent screen, scopes, test users, OAuth client), connecting the account, the weekly re-login, health checks, fetching data from scripts or apps, and adding people to a team's shared app. Use this skill whenever someone wants to connect, set up, reconnect or troubleshoot their Fitbit / Google Health data, when an app in this repo needs health data and there is no token yet, when a call fails with ACCOUNT_NOT_LINKED, invalid_grant or "refresh token expired", or when an admin wants to add a person to a shared health app — even if they only say "my watch", "my sleep data" or "connect my health stuff".
---

# Google Health connect

This skill connects one person's Google Health account (where their Fitbit syncs) to code on their own machine. After it runs, any script or app in this repo can read their health data. Nothing goes to a server: the OAuth client and the tokens live in `~/.config/google-health/` (mode 0600) on their laptop.

The people who use this are often not technical. Talk in plain words, one step at a time, and do the clicking for them where you can. Explain *why* a step exists when it looks strange (for example the "Google hasn't verified this app" warning).

## The contract (what "connected" means)

| Item | Where |
|---|---|
| OAuth client | `~/.config/google-health/client.json` (`client_id`, `client_secret`, `client_type`, `source`) |
| Tokens | `~/.config/google-health/token.json` (access + refresh token, `obtained_at`, scopes) |
| CLI | `node scripts/gh.mjs <command>` (paths relative to this skill folder) |
| Library for apps | `scripts/lib/google-health.mjs` — `getAccessToken()`, `api()`, `listDataPoints()`, `dailyRollUp()`, `doctor()`, `login()` |

`GOOGLE_HEALTH_DIR` overrides the folder. Node 18+ is the only requirement. All `scripts/…` and `references/…` paths in this file are relative to this skill's folder (from the starter repo root, that is `.claude/skills/google-health-connect/`).

## Step 0 — Check the current state first

```bash
node scripts/gh.mjs doctor
```

Route on the result. Do not start the setup again if it is not needed:

- **All OK**: they are connected. Go to "Use the data".
- **`token` / `refresh` FAIL with REAUTH_REQUIRED**: the weekly expiry happened. Go to Step 3 (login) only.
- **`account linked` FAIL (ACCOUNT_NOT_LINKED)**: the Google account they logged in with has no Google Health data. Ask which account the Fitbit uses (Step 1). Then log in again with that account.
- **`oauth client` FAIL (NO_CLIENT)**: first-time setup. Go to Step 1.

## Step 1 — Two questions before anything else

1. **Which Google account is the Fitbit linked to?** They can see it in the Google Health (Fitbit) app → profile picture → account. It is often a personal Gmail, not their work account. Every later step must use this exact account. A wrong account is the most common failure.
2. **Own app or a shared app?** Ask this only if their team runs a shared app (they will know, because someone told them). Otherwise, go straight to path A. Explain the choice simply:
   - **Own app (path A, recommended):** they create their own small Google Cloud app (about 15 minutes, you do most of the clicks). The data relationship is only between them and Google. Nobody is in the middle.
   - **Shared app (path B):** faster. They send their admin the email from question 1 first. The admin adds them as a tester, then they connect. The admin still never sees their data, because tokens stay on their laptop. But the app (the "client") belongs to the admin.

   Both paths need a new login every 7 days, because Google limits apps in "Testing" mode. `doctor` and `status` show the days left.

## Step 2A — Own app

Follow `references/own-project.md`. It has every console URL, what to click, how to verify each step, and the known traps. Summary:
create project → enable Google Health API → Google Auth Platform (External) → add scopes → add themself as test user → create a **Desktop app** OAuth client → save the client with `import-client-text` before the dialog closes.

## Step 2B — Shared app

Follow `references/shared-app.md`. Member side: send the Fitbit Google email to the admin, wait for the OK, receive the client JSON through a private channel, then run `node scripts/gh.mjs import-client <file> --source shared-app`. The admin side (adding test users, one-time setup) is in the same file.

## Step 3 — Log in (also the weekly re-login)

Run the login in the background. It prints `AUTH_URL …` and waits for Google to redirect to `http://127.0.0.1:<random port>/`:

```bash
node scripts/gh.mjs login --hint <fitbit-google-email> --no-browser   # background; read AUTH_URL from its output
```

Open the AUTH_URL in the browser where that Google account is signed in. If you drive the browser, append `&hl=en` so the screens are in English. Without browser control, drop `--no-browser` and the URL opens in their default browser.

Screens they will see:
1. **Account chooser**, if several Google accounts are signed in and no hint was given. They pick the Fitbit account.
2. **"Google hasn't verified this app"**: this is normal for a personal Testing app. They click **Continue**.
3. **"Sign in to <app>"**: Google shares their name and email with the app. The login asks for `openid email`, so later re-logins can pre-select the right account. **Continue**.
4. **Consent**: either one checkbox per data type (tick **Select all**, then **Continue**), or, if they agreed before, "<app> already has some access" with only **Continue**.
5. **"Google Health connected. You can close this tab."**: the login process exits and prints the status.

In the desktop app (`npm run dev` in the starter repo), the same flow starts from the **Reconnect** button. The app detects expired logins by itself. Use the CLI only for first setup or when the app is not running.

Let the person click the two consent screens themselves when they can. It is their health data, and the consent should be theirs. Click for them only if they ask you to. If they untick some data types, the token gets only those scopes. That is fine, but data of other types then returns 403.

Use `--scopes all` (read + write) only when they want to write data, for example to log food. The scopes must also be in the app's Data Access list (path A adds them all).

## Step 4 — Verify and show something real

```bash
node scripts/gh.mjs doctor
node scripts/gh.mjs daily steps <7 days ago> <tomorrow>
node scripts/gh.mjs list sleep 'sleep.interval.civil_end_time >= "<yesterday>"'
```

Show a short human summary, for example: "Your Fitbit Air is connected: battery 77%, last sync 10 minutes ago. Last night you slept 7 h 42 min. Yesterday you walked 9,765 steps." This is the moment it becomes real for them.

## Use the data

- From the shell: `node scripts/gh.mjs get|post|list|daily …` (see the header of `scripts/gh.mjs`).
- From app code (Node/Electron main process): `import { listDataPoints, dailyRollUp, api } from "<this skill>/scripts/lib/google-health.mjs"`. Never call the API from a browser renderer: the token must stay in the main process.
- Endpoints, data types, filter syntax, rollup limits and API quirks: `references/api.md`. Read it before you write code against the API. Several things are not obvious (sleep filter fields, `total-calories` has no list, numbers come back as strings).

## Privacy rules (why they matter)

Health data is the most sensitive personal data there is, and in the EU it is a special category under GDPR. The trust that makes this project work breaks easily, so:

- Never print, log, commit or paste the client secret, access token or refresh token. Write them straight to the 0600 files (`import-client-text` exists for this reason). `.gitignore` must keep `~/.config`-style secrets and any local data cache out of git.
- Do not send health data to any external service (an LLM API, analytics, a webhook) unless the person asks for it and understands where it goes.
- With a shared app, the admin gets an email address and nothing else. Never build anything that sends data or tokens to the admin or the organization.

## Driving the browser

Most of path A happens in the Google Cloud Console, and the login happens on Google's consent screens. Use the best option you have:

1. **agent-browser over CDP (preferred)**: `scripts/browser-debug.sh status`, then `start` to relaunch their browser with a debug port. Their Google sessions stay. **Ask before `start`: it quits the browser and can close their tabs.** Then use `agent-browser --cdp 9222 open|snapshot -i|click|fill|get text body`. When you are done, run `scripts/browser-debug.sh stop`, so no local process can control their browser afterwards.
2. **Claude in Chrome / built-in browser tools**: these work the same way.
3. **No browser control**: guide them click by click with `references/own-project.md`, and ask for a screenshot when unsure.

Lessons from real runs (each one cost time):
- Add `hl=en` to console URLs. The UI language otherwise follows the account (Spanish, etc.).
- A click sometimes does nothing (Save, Create, Continue). After every important action, **check the result**: reload the page and confirm that the value is there. If not, re-snapshot and click again by fresh ref.
- In the Cloud Console use `get text body`. `main` is not found.
- Pass absolute paths to `agent-browser screenshot`.
- Google sometimes asks for the account **password again** in the middle of console work (a URL with `accounts.google.com/v3/signin/challenge/pwd`). Stop and ask the person to type it themselves. Never type or ask for passwords in chat. Then reload the page and check that the last change was saved.
- Check the account chip at the top right of the console. It must be the account you mean to use (`authuser` in the URL selects among signed-in accounts).
