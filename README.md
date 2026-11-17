# Google Health Starter

Build your own health app on top of your Fitbit, with [Claude Code](https://claude.com/claude-code). You do not need to know how to code.

It is a desktop app (Electron + React + Tailwind + a local SQLite database) with the hard parts already done:

- **Connect your Fitbit** through the new [Google Health API](https://developers.google.com/health): Claude guides you through the Google Cloud setup, click by click.
- **Local sync**: the app downloads your last 30 days, then keeps itself up to date while it is open (every 15 minutes, on wake, on focus).
- **Login care**: when Google asks you to log in again (every 7 days for personal apps), the app tells you, and you click **Reconnect**.
- **Two Claude Code skills**: one connects your account, and one interviews you, suggests ideas that fit you, and builds the first one with you.

## Start

1. Make **your own private copy**: click **Use this template → Create a new repository → Private**, or just clone it. *Do not fork it*: forks of a public repo are public, and your copy will hold code about your health.
2. Open the folder with Claude Code.
3. Say **"connect my Fitbit"**. The first time takes about 15 minutes.
4. Say **"open my health app"**. Claude runs `npm install` and `npm run dev`.
5. Say **"help me start"**. Claude asks you a few short questions, suggests three ideas, and builds the first one with you. Or just ask for what you want, for example: *"show how my sleep changes on days with many meetings"*, or *"let me log what I eat with a photo"*.

Requirements: macOS (tested; Windows and Linux should work but are untested), Node 22+, a Google account linked to a Fitbit or another device in the Google Health app.

## Privacy

- Your data stays on your computer. The tokens are in `~/.config/google-health/` (readable only by you), and the database is in the app's own data folder. Neither is ever in this repo.
- You create your own Google Cloud app, so the data relationship is only between you and Google. (A team can also run one shared app: see `.claude/skills/google-health-connect/references/shared-app.md`.)
- Nothing goes to an AI service unless you ask for a feature that needs it. The onboarding asks you about this, and Claude respects your answer.

## What is inside

- `src/`: the desktop app. `CLAUDE.md` explains how the parts fit together and how to extend them.
- `.claude/skills/google-health-connect/`: setup guide, API notes, and a small CLI (`npm run doctor`, `npm run connect -- …`).
- `.claude/skills/health-onboarding/`: the interview, a catalog of 19 ideas, and integration notes (calendar, task tools, food photos).

## Disclaimer

This is a personal hobby tool, **not a medical device and not medical advice**. Numbers like "readiness" or "stress" are rough estimates. Talk to a doctor about anything health-related. Fitbit and Google Health are trademarks of Google LLC. This project is not affiliated with Google.

## License

[MIT](LICENSE)
