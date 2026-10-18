# Deploying AI Fluency

Target: **Vercel** (hosts the app) + **Neon** (the database) + **Anthropic** (the Claude-powered features) + **Voyage** (the search behind "Ask my glossary").

You already have all four accounts from Iron Atlas. AI Fluency gets its **own** Vercel project and its **own** Neon project, so nothing here touches Iron Atlas.

Plan on about 30 minutes. Do the parts in order.

> **Never paste any of the values below into a chat**, including with Claude. They're passwords. They only go in two places: your local `ai-fluency/.env.local` file (optional) and Vercel's Environment Variables screen.

---

## What it costs

| Service | Cost |
|---|---|
| Vercel | Free (Hobby plan) |
| Neon | Free. The free plan allows 100 projects, so a second one for this app is fine. |
| Voyage | Free tier. Embedding every card uses a few tens of thousands of tokens, against a free allowance in the hundreds of millions. |
| Anthropic | **Pay as you go.** This is the only real cost. See below. |

**Anthropic estimate** (Claude Opus 5.5, $4 per million input tokens and $20 per million output tokens):

- Explain It Back grading: about 2 to 3 cents each
- A live Deal Desk or boss-battle call: about 10 to 25 cents per conversation
- Turning a page of course notes into cards: about 5 to 10 cents
- An "Ask my glossary" question: about 2 to 4 cents

Studying 20 to 30 minutes a day with a mix of these lands around **$5 to $15 a month**. The app has its own spending cap (`AI_MONTHLY_BUDGET_USD`, $20 by default). When it's reached, the AI features pause until the next month and everything else keeps working. Set a matching limit in the Anthropic Console as a backstop (Part 3, step 3).

Flashcards, the glossary, Jargon Buster, Myth or Fact, the scripted Deal Desk calls, and the progress dashboard never call Claude. They're free to use as much as you like.

---

## Part 1: Get the code merged

Vercel deploys from `main`, so merge the two pull requests first, in this order:

1. PR #6 (the plan and the first cards)
2. PR #7 (the app)

---

## Part 2: Neon, the database

1. Go to <https://console.neon.tech/> and sign in (GitHub login works).
2. Click **New project**.
   - Name: `ai-fluency`
   - Postgres version: leave the default
   - Region: the one closest to you (for example *US West* or *US East*)
3. Click **Create project**.
4. On the project dashboard, click **Connect** (or find **Connection string**). Turn **Connection pooling** *off*, the same setup as Iron Atlas, then copy the string. It looks like:

   ```
   postgresql://neondb_owner:abc123...@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

   (If you copied the pooled one, with `-pooler` in the address, that works too. The app detects it.)

5. Keep it somewhere safe for Part 4. This is your `DATABASE_URL`.

You don't need to create any tables. The app does that automatically on its first deploy.

---

## Part 3: Anthropic and Voyage keys

### Anthropic (for Explain It Back, live Deal Desk, notes to cards, boss battles, Ask my glossary)

1. Go to the Claude Console at <https://platform.claude.com> and sign in.
2. Open **API keys** → **Create key**. Name it `ai-fluency` so its spend shows up separately from Iron Atlas. Copy it (it starts with `sk-ant-`). This is your `ANTHROPIC_API_KEY`.
3. Optional but recommended: under **Limits**, set a monthly spend limit (for example $25). It's a hard backstop in case anything goes wrong.

### Voyage (for Ask my glossary)

Reuse the Voyage key you made for Iron Atlas, or make a new one:

1. Go to <https://dashboard.voyageai.com/> → **API Keys** → **Create new secret key**.
2. Copy it (it starts with `pa-`). This is your `VOYAGE_API_KEY`.

---

## Part 4: Make your passcode and session secret

You sign in to the app with a passcode. The app never stores the passcode itself, only a scrambled version (a "hash"), so you create that hash on your Mac.

Open **Terminal** and run these one at a time. Replace the passcode with your own, at least 12 characters (a short phrase is easiest to type on a phone):

```bash
cd ~/AIProjects && git checkout main && git pull
cd ai-fluency && npm install
npm run passcode:hash -- "pick a phrase you will remember"
```

The last command prints a long line with a colon in the middle. That whole line is your `APP_PASSCODE_HASH`.

Then make the session secret:

```bash
openssl rand -base64 48
```

That prints a random string. It's your `SESSION_SECRET`.

To keep your passcode out of Terminal's history, run `history -c` afterwards.

---

## Part 5: Vercel, the app

1. Go to <https://vercel.com/new>.
2. Find **AIProjects** in the list and click **Import**.
3. **Project Name:** `ai-fluency`.
4. **Root Directory:** click **Edit**, choose `ai-fluency`, and click **Continue**. *This is the important one.* The repo holds several projects, and without it Vercel builds the wrong folder.
5. **Framework Preset** should show *Next.js*. Leave the build and install settings alone.
6. Open **Environment Variables** and add each of these. Paste the name exactly as written:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from Part 2 |
   | `APP_PASSCODE_HASH` | the hash from Part 4 |
   | `SESSION_SECRET` | the random string from Part 4 |
   | `ANTHROPIC_API_KEY` | from Part 3 |
   | `VOYAGE_API_KEY` | from Part 3 |

   Optional settings. Each has a sensible default if you leave it out:

   | Name | Default | What it does |
   |---|---|---|
   | `AI_MONTHLY_BUDGET_USD` | `20` | Estimated Claude spend per calendar month before the AI features pause. |
   | `AI_DAILY_CALL_CAP` | `150` | Maximum Claude calls per day, a guard against a runaway loop. |
   | `AI_DISABLED` | unset | Set to `1` to switch off every AI feature instantly. |
   | `WEEKLY_XP_QUOTA` | `600` | Your weekly XP target (your "quota"). |
   | `APP_TIMEZONE` | `America/Los_Angeles` | Decides when "today" and "this week" start, for streaks and quota. |

7. Click **Deploy**. The first build takes a few minutes, because it also creates the database tables and builds the search index for Ask my glossary.

If one of the first three settings is missing or wrong, the app refuses to start and the error names the setting. (Without the Anthropic or Voyage key, the app still runs, and the AI pages say what's missing.) Look under **Deployments** → the failed deployment → **Logs**, fix the variable under **Settings** → **Environment Variables**, then click **Redeploy**.

---

## Part 6: Put it on your iPhone

1. Open the Vercel URL (something like `ai-fluency-xyz.vercel.app`) in **Safari** on your iPhone.
2. Sign in with your passcode.
3. Tap the **Share** button → **Add to Home Screen** → **Add**.

It now opens from your home screen like a normal app, without Safari's address bar. Do the same in Safari on your Mac if you like (**File** → **Add to Dock**).

---

## Ongoing

**Updates deploy themselves.** Every time a change is merged into `main`, Vercel rebuilds the app, and any database changes are applied as part of the build.

**Preview deployments.** Vercel also builds a preview for every pull request. Previews skip the database setup, so a preview link may show an error page. That's expected. Only the main URL is your real app.

**Changing your passcode.** Run `npm run passcode:hash` again, paste the new value into `APP_PASSCODE_HASH` in Vercel, and redeploy. To sign out every device at once, also replace `SESSION_SECRET`.

**Locked out after too many wrong tries?** Wait 15 minutes. The limit applies per device, so a stranger guessing can't lock out your phone.

**Turning the AI off quickly.** Set `AI_DISABLED` to `1` in Vercel and redeploy. Everything except the Claude-powered features keeps working.

---

## Optional: run it on your Mac

You don't need this to use the app. It's for trying changes before they go live.

```bash
cd ~/AIProjects/ai-fluency
cp .env.example .env.local   # then fill in the values (use the local DATABASE_URL already in the file)
npm run db                   # terminal 1: a local database, separate from Neon
npm run db:migrate           # once
npm run dev                  # terminal 2: open http://localhost:3200
```

The local database and Neon are completely separate. Nothing you do locally touches the live app.
