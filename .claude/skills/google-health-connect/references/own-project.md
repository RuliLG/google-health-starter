# Path A — the person creates their own Google Cloud app

Goal: a Google Cloud project owned by the person, with the Google Health API enabled, an External OAuth app in Testing mode, the person as test user, and a Desktop OAuth client saved locally.

Use **the same Google account as the Fitbit** for the console when possible. Then everything lives in one account they own. A different account can own the project, but the Fitbit account must still be added as a test user.

All URLs take `?project=<PROJECT_ID>&hl=en`. Verify each step before you go to the next. Clicks in the console sometimes do nothing.

Status of each step: ✅ tested end to end on 2026-11-17, 🟡 not yet tested in a real run (check carefully).

---

## A1. Project 🟡

URL: `https://console.cloud.google.com/projectcreate?hl=en`

- First visit with a new Gmail account: Google asks to accept the Cloud Terms of Service (country + checkbox). The person must accept this themselves.
- Project name: something like `my-health`. No organization ("No organization") is fine for personal Gmail.
- No billing account is needed for the Google Health API (the tested project had none attached to this API).
- Verify: the project picker shows the new project, and the welcome page shows the Project ID. Note the **Project ID** (not the name).

## A2. Enable the Google Health API ✅

URL: `https://console.cloud.google.com/apis/library/health.googleapis.com?project=<PROJECT_ID>&hl=en` → **Enable**.

- Service name: `health.googleapis.com`. Display name: "Google Health API".
- Verify: `https://console.cloud.google.com/apis/api/health.googleapis.com/overview?project=<PROJECT_ID>&hl=en` shows Status **Enabled**.

## A3. Google Auth Platform (consent screen) ✅

URL: `https://console.cloud.google.com/auth/overview/create?project=<PROJECT_ID>&hl=en`

If the page says "Google Auth Platform not configured yet", click **Get started**. A 4-step wizard follows:

1. **App information**: App name (shown on the consent screen, e.g. `my-health`). User support email: pick their email from the dropdown. → Next
2. **Audience**: **External**. ("Internal" exists only when the project is in a Workspace org, and it works only if the Fitbit account is in that org. For personal Gmail it is always External.) → Next
3. **Contact information**: type their email and press **Enter**, so it becomes a chip. → Next
4. **Finish**: tick "I agree to the Google API Services: User Data Policy" (the person agrees to it, so tell them), then **Continue** → **Create**.

- It shows "Processing…" for 10–60 s.
- Verify: `/auth/overview` shows "OAuth configuration created" / OAuth overview, and `/auth/audience` shows Publishing status **Testing**, User type **External**.

## A4. Data Access (scopes) ✅

URL: `https://console.cloud.google.com/auth/scopes?project=<PROJECT_ID>&hl=en`

1. **Add or remove scopes** opens a side panel.
2. Under **Manually add scopes**, paste this comma-separated list, then click **Add to table**:
   ```
   https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly,https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly,https://www.googleapis.com/auth/googlehealth.sleep.readonly,https://www.googleapis.com/auth/googlehealth.nutrition.readonly,https://www.googleapis.com/auth/googlehealth.profile.readonly,https://www.googleapis.com/auth/googlehealth.settings.readonly,https://www.googleapis.com/auth/googlehealth.ecg.readonly,https://www.googleapis.com/auth/googlehealth.irn.readonly,https://www.googleapis.com/auth/googlehealth.location.readonly,https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly,https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly,https://www.googleapis.com/auth/googlehealth.sleep.writeonly,https://www.googleapis.com/auth/googlehealth.nutrition.writeonly,https://www.googleapis.com/auth/googlehealth.profile.writeonly,https://www.googleapis.com/auth/googlehealth.settings.writeonly,https://www.googleapis.com/auth/googlehealth.logged_symptoms.writeonly,https://www.googleapis.com/auth/googlehealth.mindfulness.writeonly,https://www.googleapis.com/auth/googlehealth.reproductive_health.writeonly
   ```
   We register read **and** write scopes now, so a later "log my food" feature does not need another trip to the console. The login itself asks only for read scopes unless `--scopes all` is used. Write scopes 🟡: they are registered but not yet used in a real run.
3. Check that all rows are ticked → **Update** (the panel closes).
4. Click **Save** at the bottom of the page. Wait for "Data access changes saved".

- Verify: **reload** `/auth/scopes`. The Google Health scopes must be listed: `settings.readonly` (+ `settings.writeonly`) under "sensitive", the rest under "restricted". **The restricted table shows 10 rows per page**: read its counter ("1 – 10 of 16" = all 16 restricted ones, + 2 sensitive = 18). Do not count only the visible rows. In one run the first save did not persist, so always reload and check the counter.
- Restricted scopes are fine in Testing mode with test users. Only a public Production app needs Google's verification and a paid CASA security assessment. We never need that.

## A5. Test user ✅

URL: `https://console.cloud.google.com/auth/audience?project=<PROJECT_ID>&hl=en`

1. Test users → **+ Add users**.
2. Type the **Fitbit Google account** email and press **Enter** (a chip appears).
3. Click **Save** in the side panel.

- Verify: **reload** the page. The email must be in the Test users table. In a real run the first Save click did nothing. Clicking it by role/name worked.
- Ignore the "0 users (0 test, 0 other)" counter. It counts people who have logged in, not the list.

## A6. Desktop OAuth client ✅

URL: `https://console.cloud.google.com/auth/clients/create?project=<PROJECT_ID>&hl=en`

1. Application type: **Desktop app**. (No redirect URIs to set: desktop clients accept any `http://127.0.0.1:<port>` loopback. A **Web application** client with redirect `http://localhost:8765/callback` also works, but it needs that extra field.)
2. Name: e.g. `health-local`.
3. Leave "Use this client for an AI-powered agent" unticked (its effect is not documented for this use).
4. **Create**. A dialog "OAuth client created" shows the Client ID and **Client secret**.
5. **The secret is shown only this once.** Save it before you touch the dialog:
   ```bash
   agent-browser --cdp 9222 get text body | node scripts/gh.mjs import-client-text
   ```
   This prints the client with the secret hidden. Without browser control, ask the person to click **Download JSON**. Then run `node scripts/gh.mjs import-client ~/Downloads/client_secret_<…>.json` and delete the downloaded file.
6. Close the dialog (**OK**).

- Verify: `/auth/clients` lists the client, and `node scripts/gh.mjs doctor` shows `OK oauth client: desktop client (own-project)`.
- Lost secret? You cannot get it back. Create a new client and import it again.

## A7. Prerequisite on the phone

The Fitbit must be set up in the **Google Health app** (formerly the Fitbit app) and signed in with the same Google account. Old Fitbit accounts must be moved to Google first. If not, every data call returns `ACCOUNT_NOT_LINKED`, and the consent screen does not warn about it.

Then go back to SKILL.md Step 3 (log in).
