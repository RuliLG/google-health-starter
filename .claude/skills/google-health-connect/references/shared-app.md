# Path B — a shared app run by your team

Optional. A team (a company, a club, a family) can run **one** Google Cloud project with the Google Health API and **one** Desktop OAuth client, and let its members connect their own accounts to it. Tokens are still created and stored only on each member's laptop. The admin never receives health data or tokens. The admin only knows each member's email address, because Google requires every tester to be listed.

Use it when people want to skip the 15-minute console setup of path A. The trade-off: the app (the "client") belongs to the admin, not to the person.

## Member side

1. Find the Google account linked to the Fitbit (Google Health app → profile → account).
2. **Send that email to your admin first.** For example: "Please add `name@gmail.com` to the <App Name> health app."
3. Wait for the OK. Until you are added, Google shows "Access blocked: <App Name> has not completed the Google verification process" (`access_denied`).
4. Get the client file (JSON) from the admin through a private channel: a password manager share or a direct message, never a public channel or a git repo. Import it, then delete the received file:
   ```bash
   node scripts/gh.mjs import-client <path/to/client.json> --source shared-app
   ```
   In the desktop app, the setup screen has an **Import client file…** button that does the same thing.
5. Continue with SKILL.md Step 3 (log in). The screens show the shared app's name: the unverified-app warning → "Sign in to <App Name>" → tick **Select all** → Continue.

Stopping: `node scripts/gh.mjs logout` (revokes the token), and/or remove the app at https://myaccount.google.com/connections.

## Admin: add a person

URL: `https://console.cloud.google.com/auth/audience?project=<PROJECT_ID>&hl=en`

1. Check the account chip at the top right: the account that owns the project.
2. Test users → **+ Add users** → type the email → press **Enter** (a chip appears) → **Save**.
3. Reload and confirm that the email is in the table. The first Save click often does nothing. Google may also ask for the admin password again at this point. The admin types it, never the agent. After that, reload and check.
4. Send the person the client file privately.

Remove people who leave (trash icon in the same table). Limit: 100 users over the app's whole lifetime while unverified, so removed users still count.

If an agent drives the admin's browser: **work in a separate tab** (`agent-browser --cdp 9222 tab new <url>`). The admin may be using the same browser, and commands follow the active tab. Re-snapshot after switching tabs, because element refs reset.

## Admin: one-time setup

Same as `own-project.md` A1–A6, in a project owned by the team:
- App name: something members recognize (it shows on the consent screen).
- Audience: **External** (members usually use personal Gmail accounts).
- Register read + write scopes (A4).
- Create **one Desktop app client**, and keep its JSON in the team's password manager. Never commit it. Google treats desktop client secrets as non-confidential, but anyone who has the file can show a consent screen with your app's name to your testers.

Write a short, honest note that every member reads before they connect: participation is voluntary, the admin never gets their data or tokens, everything stays on their laptop, and they can disconnect at any time.
