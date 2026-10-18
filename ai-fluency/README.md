# AI Fluency

A study app for learning AI terms well enough to explain them to customers. It runs in Safari on iPhone and Mac and can be added to the home screen like an app. See [PLAN.md](PLAN.md) for the full plan and roadmap.

**What works now (v1, steps 1 to 3 of the plan):**
- 50 starter cards in two tracks, each with a plain-English version, a customer line, a likely follow-up, an under-the-hood version, and a myth/fact pair
- Flashcard study with spaced repetition: rate each card Again, Hard, Good, or Easy and it comes back right before you'd forget it (up to 10 new cards a day)
- A glossary with search and track filters, plus a page for each term with sources and related terms
- A progress dashboard by track (new, learning, mastered)
- Single-passcode sign-in, rate-limited per device
- Installable as a home-screen app, with glossary pages readable offline once opened

Games (Jargon Buster, Myth or Fact, Deal Desk), XP, and ranks come next.

## Stack

Next.js 16 + TypeScript + Tailwind, Postgres via Drizzle (Neon in production, PGlite locally), deployed on Vercel. Same setup as `iron-atlas/`, copied rather than shared, so the two projects stay independent.

## Run it locally

```bash
cd ai-fluency
npm install
cp .env.example .env.local
npm run passcode:hash -- "your passcode"   # paste the output into APP_PASSCODE_HASH
openssl rand -base64 48                     # paste into SESSION_SECRET

npm run db            # terminal 1: local Postgres on port 5433
npm run db:migrate    # once, to create the tables
npm run dev           # terminal 2: http://localhost:3200
```

## How it's organized

| Path | What's there |
|---|---|
| `content/terms/*.json` | The cards. Edit these to change wording. |
| `content/REVIEW.md` | Readable version of the cards for review. Regenerate with `npm run content:review`. |
| `src/lib/srs.ts` | The spaced-repetition schedule (a simplified SM-2, the algorithm behind Anki). |
| `src/lib/progress.ts` | Today's study queue and saving ratings. |
| `src/lib/auth.ts`, `session.ts`, `passcode.ts` | Passcode sign-in and the signed session cookie. |
| `src/db/schema.ts` | Database tables. Only study progress is stored; the cards stay in JSON. |
| `src/app/` | Pages: today (`/`), study (`/study`), glossary (`/terms`), sign-in. |

## Decisions

- **Cards live in JSON, not the database.** Wording changes show up in a normal code review and never need a migration. The database only holds progress, keyed by card id.
- **No user accounts.** It's a personal app, so one passcode (stored as a scrypt hash) plus a signed cookie is enough. Rotating `SESSION_SECRET` signs every device out.
- **Sign-in rate limiting is per IP**, so someone guessing at the form can't lock you out of your own phone.
- **Study sessions aren't cached offline.** A rating has to reach the server to count; quietly queueing it could lose progress. Glossary pages are cached for reading.

## Checks

```bash
npm run typecheck && npm run lint && npm test
npm run content:review   # validates the cards and rebuilds REVIEW.md
```
