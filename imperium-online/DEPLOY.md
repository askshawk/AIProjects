# Deploying Imperium Online

Three pieces: a **Postgres database**, the **API** (FastAPI), and the **web app**
(Next.js). All three have free tiers that comfortably fit this game.

Everything here needs *your* accounts — that, and nothing about the code, is the
only reason this isn't already live.

There are two routes. Pick one:

- **[Route A — browser only](#route-a--browser-only-no-cli)**, no installs. ~15 minutes.
  Start here.
- **[Route B — Fly + Vercel CLI](#route-b--fly--vercel-cli)**, more control, needs
  two CLIs. ~20 minutes.

Both end with the same running game. Route A is *not* a lesser version.

> Free-tier terms change; the shapes below were accurate when written but check
> each provider's current page before assuming "free".

---

## Route A — browser only (no CLI)

The code is already on GitHub, and both hosts can deploy straight from a repo, so
this whole route is clicking through three websites.

**1. Database — [neon.tech](https://neon.tech).** New project → copy the connection
string. Change the scheme to `postgresql+psycopg://` (that's the driver this app
uses; the rest of the URL is unchanged). Neon's free tier doesn't expire, which is
why it's here rather than the host's own free Postgres.

**2. API — [render.com](https://render.com).** New → **Blueprint** → connect the
repo. Render reads [`render.yaml`](../render.yaml) at the repo root and configures
the service itself: Docker build from `imperium-online/server`, `APP_ENV=production`,
`TRUST_PROXY=1`, `COOKIE_SECURE=1`, and a generated `JWT_SECRET`. You fill in two
values it can't know:

- `DATABASE_URL` — the Neon string from step 1
- `CORS_ORIGINS` — a placeholder for now; you'll have the real one after step 3

Deploy, then open `https://YOUR-API.onrender.com/health` — it should say
`{"status":"ok"}`. If it refuses to boot instead, read the error: that's the
production guard in `server/app/config.py` listing exactly what's misconfigured.

**3. Web app — [vercel.com](https://vercel.com).** Add New → Project → import the
same repo. Set **Root Directory** to `imperium-online/web`, and add one
environment variable:

- `NEXT_PUBLIC_API_URL` = `https://YOUR-API.onrender.com`

Deploy.

**4. Close the loop.** Back in Render, set `CORS_ORIGINS` to the exact Vercel URL
(`https://your-app.vercel.app` — scheme included, no trailing slash). Saving it
restarts the service. Now skip to [Check it](#3--check-it).

**The one tradeoff:** a free Render service sleeps after ~15 minutes idle, so the
first visit after a quiet spell takes about a minute to wake. It doesn't lose
anything — see [the note on sleeping](#does-sleeping-break-the-game) below.

---

## Route B — Fly + Vercel CLI

## Before you start

```bash
brew install flyctl                 # macOS
npm i -g vercel
fly auth login
vercel login
```

A Postgres database. [Neon](https://neon.tech) has a free tier and gives you a
connection string; Fly Postgres works too. You want a URL shaped like:

```
postgresql://user:password@host/dbname
```

**Change the scheme to `postgresql+psycopg://`** — that is the driver this app
uses. Same URL otherwise.

---

## 1 — The API (Fly.io)

```bash
cd imperium-online/server
fly launch --no-deploy          # accept the existing fly.toml when asked
```

`fly.toml` already sets `APP_ENV=production`, `TRUST_PROXY=1` and
`COOKIE_SECURE=1`. Secrets are deliberately *not* in it — set them now:

```bash
fly secrets set \
  JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')" \
  DATABASE_URL="postgresql+psycopg://user:password@host/dbname" \
  CORS_ORIGINS="https://REPLACE-WITH-YOUR-VERCEL-URL.vercel.app"
```

You don't know the Vercel URL yet — put a placeholder, deploy the web app in
step 2, then come back and re-run this one line with the real value.

```bash
fly deploy
fly logs                        # watch it boot
curl https://YOUR-APP.fly.dev/health     # {"status":"ok"}
```

The app runs its own migrations on startup, so there is no separate release
step. Schema changes deploy with the code.

**If it refuses to start, read the error — that's deliberate.** `APP_ENV=production`
makes the app reject development defaults rather than run insecurely while
looking healthy. It lists every problem at once with the fix for each.

---

## 2 — The web app (Vercel)

```bash
cd imperium-online/web
vercel                          # first run: links the project
```

Set the API URL, then deploy for real:

```bash
vercel env add NEXT_PUBLIC_API_URL production
# paste: https://YOUR-APP.fly.dev

vercel --prod
```

Now go back and fix CORS with the URL Vercel just gave you:

```bash
cd ../server
fly secrets set CORS_ORIGINS="https://your-app.vercel.app"
```

Setting a secret restarts the app, so that's all it takes.

---

## 3 — Check it

1. Open the Vercel URL, register an account, and confirm you land in a city.
2. Queue a build and reload — it should still be building.
3. Open DevTools → Application → Cookies. `imperium_session` should be there,
   marked **HttpOnly** and **Secure**. Local Storage should hold no token.
4. Network tab → the WebSocket should be **101 Switching Protocols**, with no
   token in its URL.

---

## The traps, in the order people hit them

**Cookies don't stick.** The API and web app are on different domains, so the
session cookie needs `SameSite=None; Secure`. `fly.toml` sets `COOKIE_SECURE=1`
for exactly this. Over plain http a Secure cookie is silently never stored —
which looks like "login does nothing".

**CORS blocks everything.** `CORS_ORIGINS` must be the exact origin, scheme
included, no trailing slash. A wildcard cannot be used with credentialed
requests at all, and the app rejects `*` on purpose.

**Preview deployments break auth.** Vercel gives each preview its own hostname,
which won't be in `CORS_ORIGINS`. Either add them or test against production.

**One worker only.** The WebSocket registry and the rate-limit counters are
both in process. A second worker splits the sockets and doubles the effective
rate limit. Redis is the fix if you ever need to scale out.

---

## Does sleeping break the game?

No — and this is worth understanding, because it's the payoff of the whole
architecture.

The instinct is that a sleeping server loses the async game: battles land while
nobody's online, so who resolves them? But `catch_up()` never depended on a
running process. State is derived from `now - last_tick_at` and absolute
`completes_at` timestamps, so **reads resolve the past**:
`resolve_due_movements()` is called from `routers/cities.py` and
`routers/movements.py`, not only from `worker.py`. A server that wakes on the
next request fast-forwards everything that was due while it slept — builds,
recruits, battles, loyalty, conquest — in time order, and the player sees the
correct world.

What sleeping actually costs is narrower than it sounds:

- **A cold first load** (~30–60s on Render's free tier).
- **Push latency, not correctness.** The worker exists to push a `attack_resolved`
  event to someone already staring at the screen. Asleep, the same battle simply
  resolves on the next read instead of arriving as a live toast.

So `auto_stop_machines = false` in `fly.toml` is a *nicety* — it keeps
WebSockets alive and events instant. It is not a correctness requirement, and an
earlier version of this file overstated it as one.

Which is why Route A's free, sleeping service is a real option and not a
compromise.

---

## Costs

Route A is free: Render's free web service, Neon's free Postgres, Vercel hobby.
Route B is free on Fly's shared-cpu-1x with one 512MB machine plus the same Neon
and Vercel tiers. The one thing that *would* cost money is keeping a machine
always on — which, per the section above, buys instant push events rather than a
working game.

## Afterwards (Route B)

```bash
fly logs                        # tail the API
fly ssh console                 # shell into the machine
fly secrets list                # names only, never values
vercel logs                     # web app
```

To roll the JWT secret, `fly secrets set JWT_SECRET=...` — every existing
session is invalidated, so everyone signs in again.
