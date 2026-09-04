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
npm run seed:demo              # one hand-transcribed program so the library isn't empty
npm run dev                    # http://localhost:3100
```

Both `ANTHROPIC_API_KEY` (generation and chat) and `VOYAGE_API_KEY` (embeddings) go in
`.env.local`. Then fill the library:

```bash
npm run generate:program -- "5/3/1 Boring But Big" --slug 531-bbb
npm run generate:program -- "Layne Norton's PHAT" --slug phat --dry-run   # inspect first
npm run generate:exercise-descriptions -- --limit 5 --dry-run            # inspect first
npm run generate:exercise-descriptions                                   # writes src/data/exerciseDescriptions.ts
```

`npm run typecheck` needs `.next/types`, which `next dev` or `next build` generates —
run one of those first after a clean checkout or `rm -rf .next`.

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
can't match, rather than inventing movements. How-to and form-cue text lives in a separate file,
`src/data/exerciseDescriptions.ts` — the pipe-delimited catalogue has no way to escape a `|` or a
newline, so 500-900 characters of generated prose per exercise gets its own file rather than an
8th column. `npm run seed:exercises` merges both into the `exercises` table.

**Programs are AI-reconstructed and labelled as such.** The library is generated from a model's
knowledge of well-known programs, not transcribed from the sources. Each row carries
`ai_generated`, the author's name, source links, and a `verified` flag to flip once a human has
checked it against the original. The UI shows the badge.

**Embeddings come from Voyage.** `voyage-4-lite` at 512 dimensions powers exercise
similarity — which is what makes "my gym has no hack squat" return V-squat, pendulum
squat, belt squat rather than a guess. This originally ran locally on transformers.js,
but the model plus onnxruntime is ~413 MB installed against a 250 MB serverless function
limit, so deployment forced an API. Anthropic has no embeddings endpoint; Voyage is its
recommended partner and the free tier covers this project many times over.

Changing model means changing `EMBEDDING_DIM` in `src/lib/embeddings.ts`, generating a
migration, and re-running `seed:exercises` — vectors from different models aren't
comparable.

## Layout

```
src/
  app/            routes (App Router)
  db/schema/      Drizzle schema — enums, library tables, user tables
  data/           the exercise catalogue + its parser/validator
  lib/            embeddings and shared logic
scripts/          db server, seeds, program generation
```

## What's here

| Route | What it does |
|---|---|
| `/coach` | Conversational intake → a real program from the library, with reasoning |
| `/programs` | Browse and filter; each program adapts to your gym and exports to a spreadsheet |
| `/exercises` | The 235-movement catalogue everything is validated against, each with a how-to guide |
| `/gym` | Your equipment — drives substitutions everywhere |
| `/train` | Today's session: prescription, last time's numbers, suggested loads, set logging |
| `/history` | Logged sessions and estimated-1RM trends |

## Deploying

See [DEPLOY.md](DEPLOY.md) — Vercel + Neon + Voyage, all free tier.

## Installing it on a phone

The app ships a web manifest and a service worker, so it installs to a home screen
and pages you've already opened stay readable without signal. Both only take effect
in a production build (`npm run build && npm start`) — the service worker is
deliberately not registered in development, where it would serve stale bundles
across edits.

Logging a session is *not* queued offline. A set that didn't reach the server
would be training data silently lost, so the submit fails visibly instead.
