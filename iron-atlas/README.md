# Iron Atlas

A library of weightlifting programs from the coaches worth reading — pick one, adapt it to the
gym you actually train in, export it to a spreadsheet, and log your sessions against it.

**Stack:** Next.js (App Router) · TypeScript · Drizzle ORM · Postgres + pgvector · Vercel AI SDK
with Claude · transformers.js for local embeddings.

## Running it

Three commands, two terminals. No Docker, no Postgres install.

```bash
npm install
cp .env.example .env.local     # DATABASE_URL is already correct for local dev
```

```bash
npm run db                     # terminal 1 — local Postgres, leave running
```

```bash
npm run db:push                # terminal 2 — create the tables
npm run seed:exercises         # load the exercise catalogue (downloads a small model once)
npm run dev                    # http://localhost:3100
```

## How the database works locally

`npm run db` starts [PGlite](https://pglite.dev) — Postgres compiled to WebAssembly — behind a
real wire-protocol socket on port 5432. The app, `drizzle-kit`, and every script connect to it
with the same `postgres.js` driver and the same `DATABASE_URL` they'd use against a hosted
Postgres in production, so there's no dialect drift between dev and prod. Data lives in
`.pglite/` (gitignored); delete that directory to start clean.

PGlite is a single-connection database, so the socket server is started with `maxConnections`
to multiplex — without it the Next dev server's connection pool gets `ECONNRESET`.

## Design decisions worth knowing

**Program templates are immutable; users fork them.** `programs` / `program_weeks` /
`program_days` / `program_exercises` are canonical library data. Starting a program deep-copies
it into the `user_program_*` tables, and every tweak, substitution, and logged set hangs off the
copy. Correcting a library program can never corrupt someone's in-progress training block, and
the fork keeps `source_*` ids so the UI can show what you changed.

**Every prescribed set points at a real exercise row.** The catalogue in `src/data/exercises.ts`
is the vocabulary; program generation resolves names against it and fails loudly on anything it
can't match, rather than inventing movements.

**Programs are AI-reconstructed and labelled as such.** The library is generated from a model's
knowledge of well-known programs, not transcribed from the sources. Each row carries
`ai_generated`, the author's name, source links, and a `verified` flag to flip once a human has
checked it against the original. The UI shows the badge.

**Embeddings run locally.** `all-MiniLM-L6-v2` via transformers.js (384 dimensions, CPU, no API
key) powers exercise similarity — which is what makes "my gym has no hack squat" return
V-squat, pendulum squat, belt squat rather than a guess. Anthropic has no embeddings endpoint,
and this avoids taking on a second provider.

## Layout

```
src/
  app/            routes (App Router)
  db/schema/      Drizzle schema — enums, library tables, user tables
  data/           the exercise catalogue + its parser/validator
  lib/            embeddings and shared logic
scripts/          db server, seeds, program generation
```
