# Deploying AI Fluency

Two free services: **Neon** holds the database and **Vercel** hosts the app. AI Fluency gets its own Neon project and its own Vercel project, so nothing here touches Iron Atlas.

There's nothing to run in Terminal. It takes about 15 minutes.

> **Never paste your connection string or passcode into a chat**, including with Claude. They only go into Vercel's settings.

---

## What it costs

**$0** if you follow this guide. Vercel's Hobby plan and Neon's free plan cover an app this size.

Without an Anthropic key, everything works except the features that need Claude: Claude-graded Explain It Back (you get a free self-graded version instead), live calls, boss battles, notes to cards, and Ask my glossary. Those pages say that AI is off. To turn them on later, see [Optional: turn on the Claude features](#optional-turn-on-the-claude-features).

---

## Step 1: Neon, the database

1. Go to <https://console.neon.tech/> and sign in (the same login as Iron Atlas).
2. Click **New Project**. Name it `ai-fluency` and pick the region closest to you. Leave everything else as it is.
3. On the project dashboard, click **Connect**. Turn **Connection pooling** off, click **Show password**, then click **Copy**.
4. Paste it into a private note. It starts with `postgresql://` and ends with `?sslmode=require`. This is your `DATABASE_URL`.

You don't need to create any tables. The app creates them on its first deploy.

## Step 2: Choose a passcode

Pick a passcode of at least 8 characters. A short phrase is easiest to type on a phone. You'll type it into Vercel in the next step, and into the app whenever you sign in.

## Step 3: Vercel, the app

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Find **AIProjects** and click **Import**.
3. **Project Name:** `ai-fluency`.
4. **Root Directory:** click **Edit**, choose `ai-fluency`, and click **Continue**. *This is the important one.* Without it, Vercel builds the wrong folder.
5. Leave **Framework Preset** (Next.js) and the build settings alone.
6. Open **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from Step 1 |
   | `APP_PASSCODE` | your passcode from Step 2 |

7. Click **Deploy**. The first build takes a few minutes because it also sets up the database.

If the deploy fails, open **Deployments**, click the failed one, then **Logs**. The error names the setting that's wrong. Fix it under **Settings** → **Environment Variables**, then click **Redeploy**.

## Step 4: Put it on your iPhone

1. Open your new link (something like `ai-fluency-xyz.vercel.app`) in **Safari** on your iPhone.
2. Sign in with your passcode.
3. Tap **Share** → **Add to Home Screen** → **Add**.

It now opens from your home screen like a normal app. On your Mac, Safari's **File** → **Add to Dock** does the same.

---

## Ongoing

- **Updates deploy themselves.** Whenever a change is merged into `main`, Vercel rebuilds the app and applies any database changes as part of the build.
- **Preview links.** Vercel also builds a preview for each pull request. Previews skip database setup, so a preview link may show an error. Only your main link is the real app.
- **Changing your passcode.** Edit `APP_PASSCODE` in Vercel, then redeploy. This also signs out every device.
- **Locked out after too many wrong tries?** Wait 15 minutes. The limit is per device, so someone guessing on their device can't lock out your phone.

---

## Optional: turn on the Claude features

This is the only part that costs money: pay as you go on Anthropic's API, which is separate from a Claude Pro subscription. Expect about $5 to $15 a month with daily use. The app pauses AI features at $20 a month by default.

1. In the Claude Console (<https://platform.claude.com>), go to **API keys** → **Create key**, and copy it.
2. In <https://dashboard.voyageai.com/>, create or reuse an API key (free) for Ask my glossary.
3. In Vercel, add `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY`, then redeploy.

Optional settings, each with a sensible default:

| Name | Default | What it does |
|---|---|---|
| `AI_MONTHLY_BUDGET_USD` | `20` | Estimated Claude spend per month before AI features pause. |
| `AI_DAILY_CALL_CAP` | `150` | Maximum Claude calls per day. |
| `AI_DISABLED` | unset | Set to `1` to switch every AI feature off instantly. |
| `WEEKLY_XP_QUOTA` | `600` | Your weekly XP target. |
| `APP_TIMEZONE` | `America/Los_Angeles` | When "today" and "this week" start, for streaks and quota. |

---

## Optional: run it on your Mac

Only needed for trying changes before they go live.

```bash
cd ~/AIProjects/ai-fluency
npm install
cp .env.example .env.local   # then set APP_PASSCODE
npm run db                   # terminal 1: a local database, separate from Neon
npm run db:migrate           # once
npm run dev                  # terminal 2: open http://localhost:3200
```
