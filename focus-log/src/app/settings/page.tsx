import type { Metadata } from "next";
import { headers } from "next/headers";
import { Nav } from "@/components/Nav";
import { signOutAction } from "@/app/actions";
import { CATEGORIES } from "@/lib/categories";
import { getGoals } from "@/lib/data";
import { GoalsForm } from "./GoalsForm";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const goals = await getGoals();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${host}`;

  const hours = Object.fromEntries(CATEGORIES.map((c) => [c, goals[c] ? String(Math.round((goals[c]! / 60) * 10) / 10) : ""]));

  return (
    <>
      <Nav current="/settings" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-5">
        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="font-medium">Weekly goals</h2>
          <p className="mt-1 text-sm text-muted">Hours per week, Monday to Sunday. Gaming is a limit, the rest are targets. Leave blank for no goal.</p>
          <GoalsForm initial={hours} />
        </section>

        <section className="space-y-3 rounded-2xl border bg-surface p-4 text-sm">
          <h2 className="text-base font-medium">iPhone setup</h2>
          <div>
            <h3 className="font-medium">1. Put it on your home screen</h3>
            <p className="text-muted">In Safari, open this site, tap Share, then Add to Home Screen. It opens full screen like a normal app.</p>
          </div>
          <div>
            <h3 className="font-medium">2. One tap to lock in (Shortcuts app)</h3>
            <p className="text-muted">
              A web app can&apos;t silence your phone or ring an alarm while it&apos;s closed, but a Shortcut can do both. In the Shortcuts app, make a new
              Shortcut called &quot;Deep Work 2h&quot; with these actions:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>
                <strong className="text-foreground">Set Focus</strong>: turn Do Not Disturb (or your Work Focus) on until turned off.
              </li>
              <li>
                <strong className="text-foreground">Start Timer</strong>: 2 hours. This is your real alarm.
              </li>
              <li>
                <strong className="text-foreground">Open URLs</strong>: the link below.
              </li>
            </ol>
            <code className="mt-2 block rounded-lg bg-surface-raised p-2 break-all">{origin}/?start=deep_work&amp;minutes=120</code>
            <p className="mt-2 text-muted">
              Swap <code>deep_work</code> for <code>dev</code>, <code>learning</code> or <code>gaming</code>, and change the minutes (leave{" "}
              <code>&amp;minutes=...</code> off for a stopwatch). Add the Shortcut to your home screen or Action button.
            </p>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-surface p-4 text-sm">
          <a href="/export" className="text-accent underline">
            Download all sessions (CSV)
          </a>
          <form action={signOutAction}>
            <button type="submit" className="rounded-lg border px-3 py-1.5">
              Sign out
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
