---
name: health-onboarding
description: First-time onboarding for someone who has a Fitbit (or other Google Health device) and just opened this health starter repo. It interviews them in plain language (goals, comfort with tech, tools to connect, privacy), saves the answers to me/profile.md, proposes three concrete app ideas that fit them, and builds the first version together. Use this whenever someone opens this repo for the first time, says "help me start", "what can I build", "onboard me", "I don't know what to do with this", asks for ideas for their health app, or when me/profile.md does not exist yet. Also use it when they want to change direction ("I want something else now").
---

# Health onboarding

Goal: within one session, take a person (often not technical) from "I have a Fitbit and this folder" to "I have my own app showing something useful about me". Then leave them with a clear next idea.

This is for fun and curiosity, and nobody forces them to do anything. Keep it light, curious and short. One question at a time. Use the AskUserQuestion tool with concrete options (they can always type their own answer). Never ask more than 7 questions in total.

## 0. Before the interview

1. If `me/profile.md` exists, read it. They were onboarded before: ask whether they want to continue with their last idea or pick a new one, and go to step 4 or 5.
2. Run `npm run doctor`. If it is not all OK, run the **google-health-connect** skill first. Real data makes the ideas concrete, so connect first and interview second.
3. Get them excited with *their own* numbers, in 3 lines, from the local DB if the app has synced (`window.health.data`), or from the CLI otherwise:
   ```bash
   npm run connect -- daily steps <7 days ago> <tomorrow>
   npm run connect -- list sleep 'sleep.interval.civil_end_time >= "<yesterday>"'
   ```
   For example: "Last night you slept 7 h 42 min (75 min deep). This week you walked 4,600 steps a day on average. Your resting heart rate is 58."

## 1. The interview (one question per message)

Ask these in order. Skip one when an earlier answer already makes it clear.

1. **Comfort with tech**: "Have you ever written code?" → *Never* / *A little* / *I'm a developer*. This sets how much you explain, and whether you show code or only results.
2. **What they care about** (multi-select): sleep better · more energy at work · move more · less stress · eat better · train for something (race, sport) · just curious about my data.
3. **Where it should live**: *An app on my laptop* (default, already in this repo) · *Just answers when I ask Claude* (no app; use the CLI and the local DB) · *A phone app* (advanced, see "Stacks").
4. **What to connect** (multi-select): my work calendar · my tasks (Plane, Linear, Todoist…) · what I eat (photos) · my training plan · nothing yet. Read `references/integrations.md` before you promise anything.
5. **Nudges**: none · a daily summary when I open the app · a desktop notification at a time I choose.
6. **AI and privacy**: "Some ideas use Claude to read your data (for example to estimate food from a photo, or to write a weekly summary). Is it OK to send that data to the Claude API?" → *No, keep everything local* / *Only summaries, never raw data* / *Yes*. Respect this answer in everything you build. Write it into the profile in bold.
7. (Optional) **Anything specific?** "Is there one question about yourself you would love an answer to?" This often gives the best idea.

## 2. Save the profile

Write `me/profile.md` (the `me/` folder is ignored by git, so it stays local). Use this format:

```markdown
# About me (for Claude)
- Tech comfort: …
- Goals: …
- Where: …
- Connect: …
- Nudges: …
- **AI / privacy: …**
- Specific question: …
- Fitbit Google account: <from token status loginHint>
## Ideas
- [ ] <chosen idea> (started YYYY-MM-DD)
- [ ] <next ideas>
```

Future sessions read it first, so nobody has to answer twice.

## 3. Propose three ideas

Pick three from `references/ideas.md` that match their goals, integrations, tech comfort and privacy answer. Mix efforts: one quick win (S), one medium (M), and one bigger "wow" (M/L) if they want it. For each idea, give:
- **What you will see**: one sentence, concrete (e.g. "a card that says *you sleep 40 min less after days with 5+ hours of meetings*").
- **Uses**: data + integrations.
- **First version**: what we build today, in about 30–60 minutes.

Ask them to pick one (AskUserQuestion). Their own idea is always welcome. Shape it with the same three lines.

## 4. Build the first version together

- Follow `CLAUDE.md` → "How to add things". Prefer `daily_metrics` over raw points for a first version.
- Work in small visible steps. After each step, run the app (`HEALTH_DEBUG_PORT=9333 npm run dev`) and show a screenshot (`agent-browser --session app --cdp 9333 screenshot <abs path>`). Non-technical people judge by what they see, not by the code.
- Narrate in one line per step what changed and why. Do not paste code unless they asked to see it.
- With fewer than 7 days of data (new watch), use what exists and say that the card gets better every day. Never fake data in their real app.
- Finish with `npm run typecheck`, and with a clear "this works now" moment.

## 5. Close the session

- Tick the idea in `me/profile.md`, and add what you learned about them.
- Suggest the next idea in one sentence.
- Remind them: the app syncs while it is open. Every 7 days Google asks for a new login, and the app shows a Reconnect button.

## Stacks

- **Default: the Electron desktop app in this repo.** It has login, the local SQLite and the periodic sync already built. Nothing to deploy. Use it unless they insist on something else.
- **"Just ask Claude"**: no UI. Answer questions with SQL on the app's database (`window.health.data.sql`, or `sqlite3 "<dbPath from Settings>"`), or with the CLI. Good for curious, non-visual people.
- **Phone (Expo / React Native)**: only if they really want it. Explain the trade-off honestly. The phone cannot reuse the laptop's local database. It needs its own OAuth client (iOS/Android type in their Cloud project), its own storage and sync, and a dev build to run on their phone. Suggest starting on the laptop and moving the best idea to the phone later.
