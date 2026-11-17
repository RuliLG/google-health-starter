# Idea catalog

Each idea lists the data it uses, what it connects to, the effort (S ≈ under 1 h, M ≈ one session, L ≈ several sessions), and a first version you can build today. Data names refer to the app's `daily_metrics` / `data_points` tables (see CLAUDE.md).

"AI" means it calls the Claude API: only if the person's profile allows it. Before writing any Claude API code, check the **claude-api** skill for current models and SDK usage.

## Sleep

1. **Sleep debt meter** (S): `sleep_minutes`. A card with "you are 2 h 10 min behind your 7 h 30 min target this week" and a 14-day bar with the target line. *First version:* the card, with a target chosen in Settings.
2. **What wrecks my sleep** (M · Calendar): `sleep_minutes`, `data_points` sleep stages, and the calendar. Compare nights after late meetings (after 19:00) or 5+ meeting hours with other nights. *First version:* a table "nights after heavy days vs normal days" with the averages of sleep and deep sleep.
3. **Bedtime consistency** (S): the sleep session start/end times. Shows how much the bedtime moves around, plus a "social jet lag" score (weekend vs weekday). *First version:* a dot chart of bedtimes over 14 days.

## Energy at work

4. **Readiness for today** (S/M): `resting_hr`, `hrv_ms`, `sleep_minutes`, each compared with their own 14-day baseline. A simple green/yellow/red with the reason ("HRV 15% below your normal"). *First version:* the card + the explanation. Say clearly that it is not medical advice.
5. **Plan my day by energy** (M · Calendar + task tool): readiness + today's meetings + open tasks. Suggests when to do deep work and which tasks to move when readiness is low. *First version:* a list of today's tasks with a "do it now / later" hint. AI version: Claude writes the plan (privacy: send only summaries).
6. **Meeting load vs heart rate** (M · Calendar): `heart-rate-5min` during meetings vs outside them. "Which recurring meeting raises your heart rate the most?" *First version:* the average heart rate per calendar event, for the last 14 days.

## Move more

7. **Desk-time breaker** (S): minute-level `steps`. A desktop notification after 60 minutes with fewer than 50 steps, during work hours only. *First version:* the notification + a daily count of "breaks taken".
8. **Walking meetings detector** (M · Calendar): finds meetings during which they walked (steps > N per minute). A weekly "walking meetings" score. *First version:* the list of walked meetings.
9. **Team-free personal challenge** (S): a goal of 7,000 steps on 5 days a week, with streaks. *First version:* a streak calendar.

## Stress

10. **Stress timeline** (M): `heart-rate-5min` during the day compared with the resting heart rate, plus `hrv_ms` at night. It marks the high-stress blocks. *First version:* today's heart rate line with highlighted blocks, and the calendar events over them if the calendar is connected.
11. **Recovery after hard days** (M): how many nights the HRV takes to come back after a low day. *First version:* a chart of the HRV against the person's normal range.

## Eat better

12. **Food photo log** (M · AI): drop a photo → Claude estimates the dish, kcal and macros → the person confirms → it is stored locally. Optionally written to Google Health (needs `nutrition.writeonly`: reconnect with `--scopes all`). *First version:* drag a photo onto the app → a confirm dialog → a list of today's meals.
13. **Late dinner vs sleep** (S once 12 exists): the last meal time vs deep sleep that night.
14. **Calories in vs out** (M): the food log vs `calories_kcal`. *First version:* a daily balance bar (estimate, not science).

## Training

15. **Training load** (M): `exercise` sessions (duration, heart rate), `active_zone_minutes`. A weekly load and a simple "load vs recovery" chart. *First version:* weekly zone minutes vs average HRV.
16. **Plan-aware readiness** (M · training plan in a file or calendar): "Today's plan says intervals. Your readiness is low, so swap it for an easy run?" *First version:* read the plan from a simple `me/plan.md`.

## Just curious

17. **Ask my data** (S): no UI. Claude answers questions with SQL on the local DB. *First version:* 5 sample questions answered.
18. **Weekly letter** (M · AI optional): every Monday, a short summary of the week. Without AI, it is a template with numbers. With AI, Claude writes it from summaries only. *First version:* a "Last week" screen.
19. **Personal records** (S): best sleep, most steps, lowest resting heart rate, longest streak. *First version:* a records card.
