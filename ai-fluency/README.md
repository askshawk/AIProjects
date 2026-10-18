# AI Fluency

A study app for learning AI terms well enough to explain them to customers. It runs in Safari on iPhone and Mac and installs to the home screen like an app. [PLAN.md](PLAN.md) has the original plan; **[DEPLOY.md](DEPLOY.md) is the step-by-step guide to putting it online.**

## What's in it

**Study (no AI cost)**
- **150 cards** in two tracks (90 AI fundamentals, 60 AI in sales and CS). Each card has a short definition, a plain-English version, a customer line, a likely follow-up with an answer, an under-the-hood version, a myth/fact pair, and sources.
- **Flashcards with spaced repetition:** rate Again, Hard, Good, or Easy and each card comes back right before you'd forget it, with up to 10 new cards a day.
- **Glossary** with search, track filters, and a page for each term.

**Play (no AI cost)**
- **Jargon Buster:** a 60-second round matching buzzwords in a customer's sentence to what they mean, with combos for streaks.
- **Myth or Fact:** ten statements per round, each with an explanation.
- **Deal Desk:** five scripted customer calls (CISO, CFO, IT director, head of risk, excited VP). Strong answers raise a deal-health meter; finish above 70 to close.

**Practice (uses Claude)**
- **Explain It Back:** explain a term in your own words (typed, or dictated with the iPhone keyboard mic). Claude grades accuracy, clarity, and jargon, and writes a stronger version. Without a Claude key, you compare with the card and grade yourself.
- **Live calls:** an unscripted buyer, picked from six personas, reacts to what you actually say, then you get a scorecard.
- **Boss battles:** a tough executive per topic, unlocked once you've mastered half that topic's cards.
- **Course notes to cards:** paste notes from Microsoft Learn, Anthropic Academy, DeepLearning.AI, and so on. Claude drafts cards, and you edit and approve each one.
- **Ask my glossary:** questions answered only from your own cards and notes, with citations (Voyage embeddings + pgvector search).

**Progress**
- XP for every review and game, a **weekly XP quota**, **streaks** with one forgiven "PTO day" a week, and a **rank ladder** (BDR to VP of Sales).
- A card counts as **mastered** only after you've remembered it across a three-week gap *and* passed Explain It Back on it, so you climb ranks by knowledge, not by grinding easy games.
- A dashboard with quota attainment over 8 weeks, mastery by topic, and your weakest cards.

Every game answer feeds the study schedule: miss a card in a game and it comes back sooner.

## Stack

Next.js 16 + TypeScript + Tailwind, Postgres via Drizzle (Neon in production, PGlite with pgvector locally), Claude (`claude-opus-5-5`) for the coaching features, and Voyage embeddings for search. Deployed on Vercel. It follows the same setup as `iron-atlas/`, copied rather than shared, so the two projects stay independent.

## Run it locally

```bash
cd ai-fluency
npm install
cp .env.example .env.local    # then set APP_PASSCODE
# optional: ANTHROPIC_API_KEY and VOYAGE_API_KEY for the Claude features

npm run db            # terminal 1: local Postgres on port 5433
npm run db:migrate    # once, to create the tables
npm run dev           # terminal 2: http://localhost:3200
```

Without the API keys it's completely free: everything works except live calls, boss battles, notes to cards, and Ask, which say AI is off, and Explain It Back switches to a self-graded version that still counts toward mastery.

## How it's organized

| Path | What's there |
|---|---|
| `content/terms/*.json` | The cards. Edit these to change wording. |
| `content/games/*.json` | Jargon Buster sentences and the scripted Deal Desk calls. |
| `content/REVIEW.md` | Readable version of every card for review. Regenerate with `npm run content:review`, which also validates cards and game content. |
| `src/lib/srs.ts` | The spaced-repetition schedule (a simplified SM-2, the algorithm behind Anki) and the mastery rule. |
| `src/lib/progress.ts` | Study queue, ratings, game answers feeding the schedule, XP awards. |
| `src/lib/rewards.ts`, `stats.ts`, `time.ts` | XP amounts, ranks, streaks with PTO days, quota, dashboard numbers, time-zone-aware days and weeks. |
| `src/lib/games.ts` | Game content and scoring (always recomputed on the server). |
| `src/lib/ai.ts` | The single gateway for Claude calls: spend caps, structured output, fallbacks, cost tracking. |
| `src/lib/coach.ts`, `personas.ts` | Prompts and output schemas for grading, roleplay, scorecards, card drafting, and Q&A. |
| `src/lib/embeddings.ts` | Voyage embeddings, the pgvector search index, and its sync. |
| `src/lib/auth.ts`, `session.ts`, `passcode.ts` | Passcode sign-in and the signed session cookie. |
| `src/db/schema.ts` | Database tables. The built-in cards stay in JSON; the database holds progress, XP, scores, your own cards and notes, AI usage, and the search index. |
| `scripts/deploy-setup.ts` | Runs migrations and the search-index sync automatically on production deploys. |

## Decisions

- **Built-in cards live in JSON, not the database.** Wording changes show up in a normal code review and never need a migration. Cards you make from notes live in the database in the same shape.
- **No user accounts.** It's a personal app: one passcode (`APP_PASSCODE`, or a scrypt hash for the cautious) plus a signed cookie whose key is derived from it, so changing the passcode signs every device out. Sign-in attempts are rate-limited per IP.
- **One gateway for every Claude call** (`src/lib/ai.ts`), with a daily call cap and a monthly budget claimed *before* each call, an off switch (`AI_DISABLED`), structured output validated with zod, and Anthropic's server-side fallback so a rare safety decline is retried instead of failing.
- **The server scores everything.** Games send raw answers; the server re-derives scores, so XP can't be inflated from the browser.
- **Pass/fail on Explain It Back is decided by a fixed rule** (accuracy 4+, clarity and jargon 3+, no factual errors), not by the model's overall impression, so the bar stays steady.
- **Your typing is treated as data in every prompt.** Answers, transcripts, and pasted notes are wrapped in tags and described to Claude as content, never instructions.
- **Study sessions aren't cached offline.** A rating has to reach the server to count. Glossary pages are cached for reading.
- **Days and weeks follow `APP_TIMEZONE`,** so streaks and quota don't flip at 5pm because servers run on UTC.

## Checks

```bash
npm run typecheck && npm run lint && npm test
npm run content:review   # validates cards and game content, rebuilds REVIEW.md
```
