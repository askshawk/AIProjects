import Link from "next/link";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { signOutAction } from "./actions";
import { TRACK_LABELS, type Track } from "@/lib/content";
import { getStudyQueue, getSummary } from "@/lib/progress";

export default async function Home() {
  await connection();
  const [queue, summary] = await Promise.all([getStudyQueue(), getSummary()]);
  const due = queue.filter((q) => !q.isNew).length;
  const fresh = queue.length - due;

  return (
    <>
      <Nav current="/" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
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
              <Link
                href="/study"
                className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-white"
              >
                Start studying
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">All caught up</h1>
              <p className="mt-1 text-sm text-muted">
                Nothing is due. New cards unlock tomorrow, or browse the glossary in the meantime.
              </p>
            </>
          )}
          <p className="mt-4 text-sm text-muted">
            {summary.reviewedToday} review{summary.reviewedToday === 1 ? "" : "s"} done today
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Progress</h2>
          {(Object.keys(summary.tracks) as Track[]).map((track) => {
            const t = summary.tracks[track];
            const pct = (n: number) => `${(n / t.total) * 100}%`;
            return (
              <div key={track} className="rounded-2xl border bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-medium">{TRACK_LABELS[track]}</p>
                  <p className="text-sm text-muted">
                    {t.mastered}/{t.total} mastered
                  </p>
                </div>
                <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-raised" aria-hidden>
                  <div className="bg-good" style={{ width: pct(t.mastered) }} />
                  <div className="bg-accent" style={{ width: pct(t.learning) }} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {t.learning} learning · {t.new} not started
                </p>
              </div>
            );
          })}
          <p className="text-xs text-muted">
            A card counts as mastered once you&apos;ve remembered it across a three-week gap.
          </p>
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
