import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AiBanner } from "@/components/AiBanner";
import { Nav } from "@/components/Nav";
import { BOSS_WIN_SCORE, LIVE_WIN_SCORE, bossStatus } from "@/lib/boss";
import { getDashboard } from "@/lib/stats";

export const metadata: Metadata = { title: "Practice" };

export default async function PracticePage() {
  await connection();
  const [d, bosses] = await Promise.all([getDashboard(), bossStatus()]);
  const unlocked = bosses.filter((b) => b.unlocked).length;

  return (
    <>
      <Nav current="/practice" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>
        <p className="text-sm text-muted">
          Saying it yourself is what makes it stick. These use Claude to coach you, so each one costs a few cents.
        </p>
        <AiBanner />

        <Link href="/practice/explain" className="block rounded-2xl border bg-surface p-5 hover:bg-surface-raised">
          <h2 className="text-lg font-semibold">Explain It Back</h2>
          <p className="mt-1 text-sm text-muted">
            Explain a term in your own words (type it, or tap the mic on your keyboard to talk). Claude grades accuracy,
            clarity, and jargon, then shows a stronger version. Passing is the last step to mastering a card.
          </p>
          {d.readyToExplain.length > 0 && (
            <p className="mt-2 text-sm font-medium text-accent">{d.readyToExplain.length} ready to master</p>
          )}
        </Link>

        <Link href="/practice/live" className="block rounded-2xl border bg-surface p-5 hover:bg-surface-raised">
          <h2 className="text-lg font-semibold">Live calls</h2>
          <p className="mt-1 text-sm text-muted">
            An unscripted buyer (a skeptical CISO, a CFO watching the budget, an over-excited VP) reacts to what you
            actually say. You get a scorecard at the end. Score {LIVE_WIN_SCORE}+ to close.
          </p>
        </Link>

        <Link href="/practice/boss" className="block rounded-2xl border bg-surface p-5 hover:bg-surface-raised">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Boss battles</h2>
            <span className="text-sm text-muted">
              {unlocked}/{bosses.length} unlocked
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            One tough executive per topic, unlocked once you&apos;ve mastered half of that topic&apos;s cards. Score{" "}
            {BOSS_WIN_SCORE}+ to win.
          </p>
        </Link>
      </main>
    </>
  );
}
