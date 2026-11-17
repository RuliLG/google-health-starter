# Integrations: how to connect each tool

General rule: each integration gets its own module in `src/main/integrations/<name>.ts`, its own table (a new migration in `src/main/db.ts`), and its credentials in `~/.config/health-starter/<name>.json` (0600, outside the repo). If it should refresh while the app is open, add it to the sync engine as an extra stream. Never put credentials in the repo or in the renderer.

## Google Calendar (often a work account)

The Fitbit usually sits on a personal Gmail, and the work calendar on a Google Workspace account. So these are often two different Google accounts.

- **Recommended for a first version: the private iCal address.** Google Calendar → Settings → the calendar → "Integrate calendar" → **Secret address in iCal format**. Store the URL in `~/.config/health-starter/calendar.json`, then fetch and parse the `.ics` file in the main process (a small parser, or the `node-ical` package). It is read-only, needs no OAuth, and works in minutes. Treat the URL like a password. If the option is missing, the Workspace admin has turned it off for the domain.
- **Later, for more control: the Calendar API with OAuth.** It needs the Calendar API enabled in the same Cloud project, the `calendar.readonly` scope, and the work account added as a test user. A Workspace admin may also need to allow the app in Admin console → Security → API controls. This is more work. Start with iCal.

## Task tools (Plane, Linear, Todoist, …)

- Use a personal API token from the tool's settings. Store `{ baseUrl?, apiKey, … }` in `~/.config/health-starter/<tool>.json`.
- **Plane**: Profile settings → **Personal Access Tokens**. Header `X-API-Key: <token>`. Issues are under `/api/v1/workspaces/<slug>/projects/<project_id>/issues/` (cloud: `https://api.plane.so`, or the self-hosted URL). Filter on the person as assignee.
- **Linear**: Settings → API → personal API key. GraphQL at `https://api.linear.app/graphql`, query `viewer { assignedIssues }`.
- **Todoist**: Settings → Integrations → API token. REST API, tasks endpoint.
- APIs change between versions, so always check the tool's current docs before you code.

## Food photos (AI)

- Needs an Anthropic API key. Use a key with a spending limit. Store it in `~/.config/health-starter/anthropic.json`, never in the repo.
- Use a current vision-capable Claude model (check the **claude-api** skill). Send only the photo and a short prompt. Do not send other health data unless the profile allows it.
- Writing meals back to Google Health needs `nutrition.writeonly`: reconnect with `npm run connect -- login --scopes all`. The setup in `own-project.md` already registers the write scopes.

## Desktop notifications

- Use Electron's `Notification` in the main process, the same as the auth reminders in `src/main/auth.ts`. Respect the person's nudge preference in `me/profile.md`.

## Discord / Slack messages

- Only if the person asks. A webhook URL in `~/.config/health-starter/<name>.json`. Never post health numbers to a shared channel without explicit consent for each message type.
