# Focus Log

A personal iPhone web app for tracking focus time and gaming time: Deep Work (job tasks, phone down), Dev (building projects), Learning (courses), and Gaming. The data lives in my own database, not a third-party app.

**Next.js 16 + Drizzle + Postgres (Neon), hosted free on Vercel.** Same stack and sign-in as [AI Fluency](../ai-fluency/).

## What it does (version 1)

- **Timer:** pick a type, then a countdown (25m to 2h, or any length) or an open-ended stopwatch. The start time is saved on the server, so closing the app or switching devices never loses a running timer.
- **Stop and save:** confirm the minutes (fix them if you forgot to stop) and add a note on what you got done.
- **Week dashboard:** focus hours, gaming hours, focus-to-gaming ratio, focus streak (days with 30m+), goal progress, a daily chart, and an 8-week trend.
- **Weekly goals:** targets for the focus types and a limit for gaming.
- **History:** sessions by day with notes, delete, and "log a past session" for when you forgot to start the timer.
- **CSV export** of everything, so the data is always yours to take elsewhere (or to paste into Claude for a review).
- **iOS Shortcut link:** `/?start=deep_work&minutes=120` starts a session in one tap. Settings explains how to pair it with a Focus mode and a real iOS timer.

## Decisions

- **No phone blocking or background alarms in the app.** A web app can't silence the phone or ring while it's closed. iOS Focus modes and the Clock timer do that well, so the Shortcut combines them with the app instead of fighting iOS.
- **$0 to run.** Vercel Hobby + Neon free plan. No Claude API calls in v1; the CSV export covers "ask Claude about my week" through a regular chat.
- **A countdown left running past zero saves only its planned length** (you probably stopped when it went off). Saving more minutes than elapsed moves the start earlier rather than ending in the future.
- **Days and weeks follow `APP_TIMEZONE`** (default `America/Los_Angeles`, weeks Monday to Sunday). A session that crosses midnight is split between the two days.
- **One running session at a time,** enforced by a unique index in the database.

## Run it locally

```bash
cd focus-log
npm install
cp .env.example .env.local      # then set APP_PASSCODE
npm run db                      # terminal 1: local Postgres (PGlite) on port 5434
npm run db:migrate              # once, and after schema changes
npm run dev                     # terminal 2: http://localhost:3300
```

Checks: `npm test`, `npm run typecheck`, `npm run lint`.

## Deploy

See [DEPLOY.md](DEPLOY.md). About 15 minutes, no terminal needed.

## Ideas for version 2

- Pull gaming time automatically from the Steam Web API (free).
- A Sunday recap computed in the app (best focus days, gaming trend).
- Compare focus hours with lifting days from Iron Atlas.
