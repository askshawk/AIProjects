import Link from "next/link";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { StatTiles } from "@/components/StatTiles";
import { signOutAction } from "./actions";
import { TRACK_LABELS, type Track } from "@/lib/content";
import { getStudyQueue } from "@/lib/progress";
import { getDashboard } from "@/lib/stats";

const MORE = [
  { href: "/play", title: "Play", body: "Jargon Buster, Myth or Fact, and Deal Desk calls." },
  { href: "/practice", title: "Practice", body: "Explain It Back, live customer calls, and boss battles." },
  { href: "/ask", title: "Ask my glossary", body: "Questions answered from your own cards and notes." },
  { href: "/notes", title: "Add course notes", body: "Turn notes from a course into new cards." },
];

export default async function Home() {
  await connection();
  const [queue, d] = await Promise.all([getStudyQueue(), getDashboard()]);
  const due = queue.filter((q) => !q.isNew).length;
  const fresh = queue.length - due;

  return (
    <>
      <Nav current="/" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <section className="rounded-2xl border bg-surface p-5">
          <p className="text-sm text-muted">Today</p>
          {queue.length > 0 ? (
            <>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {queue.length} card{queue.length === 1 ? "" : "s"} to study
              </h1>
              <p className="mt-1 text-sm text-muted">
                {due} review{due === 1 ? "" : "s"} due, {fresh} new
              </p>
              <Link href="/study" className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white">
                Start studying
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">All caught up</h1>
              <p className="mt-1 text-sm text-muted">
                Nothing is due. New cards unlock tomorrow. Meanwhile, play a game or practice a call.
              </p>
            </>
          )}
          <p className="mt-4 text-sm text-muted">
            {d.xpToday} XP today · {d.summary.reviewedToday} review{d.summary.reviewedToday === 1 ? "" : "s"}
          </p>
        </section>

        <Link href="/progress" className="block" aria-label="See full progress">
          <StatTiles d={d} />
        </Link>

        {d.readyToExplain.length > 0 && (
          <Link href="/practice/explain" className="block rounded-2xl border border-accent/40 bg-accent-soft p-4">
            <p className="font-medium text-accent">
              {d.readyToExplain.length} card{d.readyToExplain.length === 1 ? " is" : "s are"} one step from mastered
            </p>
            <p className="mt-1 text-sm">Explain {d.readyToExplain.length === 1 ? "it" : "them"} in your own words to finish.</p>
          </Link>
        )}

        <section className="grid gap-2 sm:grid-cols-2">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} className="rounded-2xl border bg-surface p-4 hover:bg-surface-raised">
              <p className="font-medium">{m.title}</p>
              <p className="mt-0.5 text-sm text-muted">{m.body}</p>
            </Link>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Tracks</h2>
          {(Object.keys(d.summary.tracks) as Track[]).map((track) => {
            const t = d.summary.tracks[track];
            const pct = (n: number) => `${(n / t.total) * 100}%`;
            return (
              <div key={track} className="rounded-2xl border bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium">{TRACK_LABELS[track]}</p>
                  <p className="text-sm text-muted">
                    {t.mastered}/{t.total} mastered
                  </p>
                </div>
                <div className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-grid" aria-hidden>
                  {t.mastered > 0 && <div className="rounded-full bg-viz-1" style={{ width: pct(t.mastered) }} />}
                  {t.learning > 0 && <div className="rounded-full bg-viz-2" style={{ width: pct(t.learning) }} />}
                </div>
                <p className="mt-2 text-xs text-muted">
                  {t.learning} learning · {t.new} not started
                </p>
              </div>
            );
          })}
        </section>

        <form action={signOutAction}>
          <button type="submit" className="text-sm text-muted underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      </main>
    </>
  );
}
