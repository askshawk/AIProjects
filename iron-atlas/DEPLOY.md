# Deploying Iron Atlas

Target: **Vercel** (app) + **Neon** (Postgres) + **Voyage** (embeddings).

Three accounts, all free tier. Nothing here costs money at this project's scale —
Neon's free tier holds far more than this database needs, Vercel's hobby tier covers
personal projects, and Voyage gives 200 million free tokens against a workload that
uses a few thousand.

---

## Part 1 — Accounts (you do these; ~15 minutes)

Do these in order. After each one you'll have a value to paste into
`iron-atlas/.env.local`. **Never paste these into a chat** — they're credentials.

### 1. Check what you already have

Before signing up for anything, see if you're already registered. Open each and
look at the top-right corner:

- <https://vercel.com/login> — try "Continue with GitHub"; if you land in a
  dashboard rather than a signup form, you already have one.
- <https://console.neon.tech/> — same.
- <https://dashboard.voyageai.com/> — same.

### 2. Neon — the database

1. Go to <https://neon.tech> → **Sign up** (GitHub login is easiest).
2. Create a project. Name it `iron-atlas`. Any region near you is fine.
3. On the project dashboard, find **Connection string** and copy it. It looks like:
   `postgresql://USER:PASSWORD@ep-something-123.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Paste it into `iron-atlas/.env.local`, replacing the local one:

   ```
   DATABASE_URL=postgresql://...paste-here...
   ```

   Keep a copy of the old local line somewhere — you'll want it back for local dev.
   Easiest is to comment it out rather than delete it:

   ```
   # local: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
   ```

### 3. Voyage — embeddings

1. Go to <https://dashboard.voyageai.com/> → sign up.
2. **API Keys** → **Create new secret key**. Copy it (starts with `pa-`).
3. Add to `iron-atlas/.env.local`:

   ```
   VOYAGE_API_KEY=pa-...
   ```

Voyage's free tier is 200M tokens. Embedding the whole exercise catalogue costs
roughly ten thousand tokens, and each coach conversation costs about fifty. You
will not approach the limit.

### 4. Vercel — hosting

1. Go to <https://vercel.com/signup> → sign up with GitHub.
2. Don't import the project yet — Part 3 covers that, and it needs the database
   seeded first.

### 5. GitHub

The repo already lives at <https://github.com/askshawk/AIProjects>. Vercel needs
access to it, which the GitHub login grants. Confirm your latest work is pushed:

```bash
cd /Users/Alanshawkrivosh1/AIProjects && git push
```

---

## Part 2 — Point the database at Neon (I can run these)

Once `DATABASE_URL` in `.env.local` points at Neon:

```bash
cd iron-atlas
npm run db:migrate        # creates pgvector + all 16 tables
npm run seed:exercises    # 235 exercises, embedded via Voyage
npm run seed:demo         # one hand-transcribed program
```

Then fill the library. Each of these costs a few cents of Anthropic usage:

```bash
npm run generate:program -- "5/3/1 Boring But Big" --slug 531-bbb
npm run generate:program -- "Arnold's Blueprint to Mass" --slug arnold-blueprint
npm run generate:program -- "Layne Norton's PHAT" --slug phat
npm run generate:program -- "PHUL (Power Hypertrophy Upper Lower)" --slug phul
npm run generate:program -- "GZCLP by Cody Lefever" --slug gzclp
npm run generate:program -- "nSuns 5/3/1 LP" --slug nsuns-531-lp
npm run generate:program -- "Candito 6-Week Program" --slug candito-6-week
npm run generate:program -- "John Meadows Mountain Dog back specialization" --slug meadows-mountain-dog-back
```

Verify before deploying:

```bash
npm run build && npm start   # http://localhost:3000, now against Neon
```

---

## Part 3 — Deploy to Vercel

1. <https://vercel.com/new> → **Import** the `AIProjects` repo.
2. **Root Directory**: set to `iron-atlas`. This matters — the repo holds several
   projects and Vercel defaults to the repository root.
3. Framework preset should auto-detect as Next.js. Leave build settings alone.
4. **Environment Variables** — add all three, for Production *and* Preview:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `VOYAGE_API_KEY` | your Voyage key |

5. **Deploy**.

The app refuses to boot if any of these is missing or still points at localhost,
and says exactly which — see `src/lib/config.ts`. A failed deploy will tell you
what's wrong in the build log rather than serving a broken app.

### After the first deploy

- Open the URL on your phone → browser menu → **Add to Home Screen**. It installs
  standalone and opens straight to `/train`.
- Sign up for an account on the deployed app; the local one doesn't carry over.
- Set your gym at `/gym`, pick a program, hit **Start this program**.

---

## Ongoing

**Deploys** happen automatically on every push to `main`.

**Schema changes**: edit `src/db/schema/*`, then

```bash
npm run db:generate       # writes a new SQL file to drizzle/
npm run db:migrate        # applies it
```

Commit the generated file — it's the record of how production got its shape.
Never use `drizzle-kit push` against Neon; it diffs against a live database and
needs an interactive prompt to confirm destructive changes.

**Adding programs** later: run `generate:program` locally with `DATABASE_URL`
pointing at Neon. The deployed app reads the same database, so new programs
appear without a redeploy.

---

## Going back to local development

Point `DATABASE_URL` back at the local line you commented out, and start the
local database:

```bash
npm run db     # terminal 1
npm run dev    # terminal 2
```

Local and Neon are entirely separate databases. Nothing you do locally touches
production.
