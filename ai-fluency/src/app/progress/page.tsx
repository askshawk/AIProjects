import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { StatTiles } from "@/components/StatTiles";
import { QuotaChart, TopicMastery } from "@/components/charts";
import { RANKS, XP } from "@/lib/rewards";
import { MASTERED_INTERVAL_DAYS } from "@/lib/srs";
import { getDashboard } from "@/lib/stats";

export const metadata: Metadata = { title: "Progress" };

const SOURCE_LABELS: Record<string, string> = {
  review: "Flashcards",
  jargon: "Jargon Buster",
  myth: "Myth or Fact",
  "deal-desk": "Deal Desk",
  explain: "Explain It Back",
  roleplay: "Live calls",
  boss: "Boss battles",
};

export default async function ProgressPage() {
  await connection();
  const d = await getDashboard();

  return (
    <>
      <Nav current="/progress" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <StatTiles d={d} />

        <section className="rounded-2xl border bg-surface p-4">
          <QuotaChart history={d.quotaHistory} quota={d.quota.target} />
          {Object.keys(d.quota.bySource).length > 0 && (
            <p className="mt-3 text-sm text-muted">
              This week:{" "}
              {Object.entries(d.quota.bySource)
                .sort((a, b) => b[1] - a[1])
                .map(([source, xp]) => `${SOURCE_LABELS[source] ?? source} ${xp}`)
                .join(" · ")}
            </p>
          )}
        </section>

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="font-medium">Rank ladder</h2>
          <p className="mt-1 text-sm text-muted">
            You climb by mastered cards, not raw XP. A card is mastered once you&apos;ve remembered it across a{" "}
            {MASTERED_INTERVAL_DAYS / 7}-week gap and passed Explain It Back on it. You have {d.summary.mastered}.
          </p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {RANKS.map((r, i) => (
              <li
                key={r.title}
                className={`flex justify-between rounded-lg px-3 py-2 ${
                  i === d.rank.index ? "bg-accent-soft font-medium text-accent" : i < d.rank.index ? "text-muted" : ""
                }`}
              >
                <span>{r.title}</span>
                <span className="tabular-nums">{r.mastered} mastered</span>
              </li>
            ))}
          </ol>
        </section>

        {d.readyToExplain.length > 0 && (
          <section className="rounded-2xl border bg-surface p-4">
            <h2 className="font-medium">One step from mastered</h2>
            <p className="mt-1 text-sm text-muted">
              You&apos;ve remembered these long enough. Explain each one in your own words to master it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {d.readyToExplain.map((t) => (
                <Link key={t.id} href={`/practice/explain?term=${t.id}`} className="rounded-full border px-3 py-1 text-sm hover:bg-surface-raised">
                  {t.term}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border bg-surface p-4">
          <TopicMastery topics={d.topics} />
        </section>

        <section className="rounded-2xl border bg-surface p-4">
          <h2 className="font-medium">Weakest cards</h2>
          {d.weakest.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nothing stands out yet. Cards you keep forgetting will show up here.</p>
          ) : (
            <ul className="mt-2 divide-y">
              {d.weakest.map((w) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/terms/${w.id}`} className="hover:text-accent">
                    {w.term}
                  </Link>
                  <span className="text-muted">
                    forgotten {w.lapses} time{w.lapses === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="text-sm text-muted">
          <h2 className="font-medium text-foreground">How XP works</h2>
          <p className="mt-1">
            Flashcards {XP.review.good} per card ({XP.review.again} on &ldquo;Again&rdquo;). Jargon Buster {XP.jargonMatch} per
            match. Myth or Fact {XP.mythCorrect} per right answer. Deal Desk {XP.dealDeskGoodAnswer} per strong answer plus{" "}
            {XP.dealDeskWin} for closing. Explain It Back {XP.explainPass} for a pass. Live calls up to{" "}
            {100 / XP.roleplayDivisor + XP.roleplayWin}. Boss battles {XP.bossWin} for a win. A PTO day each week keeps
            one missed day from breaking your streak.
          </p>
        </section>
      </main>
    </>
  );
}
