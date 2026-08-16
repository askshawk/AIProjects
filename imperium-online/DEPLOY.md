# Deploying Imperium Online

Two pieces: the **API** (FastAPI + Postgres) on Fly.io, and the **web app**
(Next.js) on Vercel. Both have free tiers that comfortably fit this game.

Everything here needs *your* accounts, so these are commands for you to run —
the repo is already configured for them.

Roughly 20 minutes end to end.

---

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

**Scaling to zero loses the game.** `auto_stop_machines = false` is deliberate:
a sleeping machine drops every WebSocket and stops the background worker that
resolves battles while players are away — which is the whole premise of an
async game.

**One worker only.** The WebSocket registry and the rate-limit counters are
both in process. A second worker splits the sockets and doubles the effective
rate limit. Redis is the fix if you ever need to scale out.

---

## Costs

Free on Fly's shared-cpu-1x with one 512MB machine, Neon's free tier, and
Vercel's hobby plan. The one thing that *would* cost money is running more than
one always-on machine.

## Afterwards

```bash
fly logs                        # tail the API
fly ssh console                 # shell into the machine
fly secrets list                # names only, never values
vercel logs                     # web app
```

To roll the JWT secret, `fly secrets set JWT_SECRET=...` — every existing
session is invalidated, so everyone signs in again.
