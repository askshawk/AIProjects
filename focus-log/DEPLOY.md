# Deploying Focus Log

Two free services: **Neon** holds the database and **Vercel** hosts the app. It takes about 15 minutes and there's nothing to run in Terminal.

> **Never paste your connection string or passcode into a chat**, including with Claude. They only go into Vercel's settings.

## What it costs

**$0.** Vercel's Hobby plan and Neon's free plan cover an app this size. Years of sessions take up a tiny fraction of Neon's free storage.

## Step 1: Neon, the database

1. Go to <https://console.neon.tech/> and sign in (the same login as Iron Atlas and AI Fluency).
2. Click **New Project**, name it `focus-log`, and pick the region closest to you.
   - If Neon says you've hit the free plan's project limit, open your AI Fluency project instead and create a new **database** in it named `focus_log`. Focus Log's tables have their own names, but a separate database keeps things clean.
3. On the dashboard, click **Connect**. Turn **Connection pooling** off, click **Show password**, then **Copy**.
4. Keep it in a private note. It starts with `postgresql://` and ends with `?sslmode=require`. This is your `DATABASE_URL`.

You don't need to create tables. The app creates them on its first deploy.

## Step 2: Vercel, the app

1. Go to <https://vercel.com/new> and import the `AIProjects` repository.
2. Set **Root Directory** to `focus-log`. Leave the framework as Next.js.
3. Under **Environment Variables**, add:
   - `DATABASE_URL`: the string from Step 1.
   - `APP_PASSCODE`: a passcode of at least 8 characters. You'll type it to sign in.
   - Optional: `APP_TIMEZONE`, if you're not on Pacific time (for example `America/New_York`).
4. Click **Deploy**. The build applies the database migrations automatically.

## Step 3: Your iPhone

1. Open the Vercel link in Safari, sign in, then tap **Share > Add to Home Screen**.
2. Set some weekly goals in **Settings**.
3. Follow the Shortcut steps on the Settings page to start a session, turn on a Focus mode, and set a real iOS timer in one tap.

## If something goes wrong

- **The deploy fails with "Focus Log is misconfigured"**: the message lists which setting is missing or wrong. Fix it in Vercel (Settings > Environment Variables) and redeploy.
- **Signed out on every device**: changing `APP_PASSCODE` does that on purpose.
