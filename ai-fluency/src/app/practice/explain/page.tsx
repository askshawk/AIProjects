import type { Metadata } from "next";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { explainAttempts } from "@/db/schema";
import { Nav } from "@/components/Nav";
import { aiStatus } from "@/lib/ai";
import { getAllProgress } from "@/lib/progress";
import { needsExplaining } from "@/lib/srs";
import { getAllTerms } from "@/lib/terms";
import { ExplainItBack, type ExplainCard } from "./ExplainItBack";

export const metadata: Metadata = { title: "Explain It Back" };

export default async function ExplainPage({ searchParams }: PageProps<"/practice/explain">) {
  await connection();
  const { term: requested } = await searchParams;
  const [terms, progress, attempts] = await Promise.all([
    getAllTerms(),
    getAllProgress(),
    db.select({ termId: explainAttempts.termId, passed: explainAttempts.passed }).from(explainAttempts).orderBy(desc(explainAttempts.at)),
  ]);

  const lastResult = new Map<string, boolean>();
  for (const a of attempts) if (!lastResult.has(a.termId)) lastResult.set(a.termId, a.passed === 1);

  // Suggested order: ready to master, then studied but never explained, then everything else.
  const rank = (id: string) => {
    const p = progress.get(id);
    if (needsExplaining(p)) return 0;
    if (p && !p.explainedAt) return 1;
    if (!p) return 2;
    return 3;
  };
  const cards: ExplainCard[] = terms
    .map((t) => ({
      id: t.id,
      term: t.term,
      topic: t.topic,
      plain: t.plain,
      customerLine: t.customerLine,
      readyToMaster: needsExplaining(progress.get(t.id)),
      explained: Boolean(progress.get(t.id)?.explainedAt),
      lastPassed: lastResult.get(t.id) ?? null,
      rank: rank(t.id),
    }))
    .sort((a, b) => a.rank - b.rank);

  const initial = typeof requested === "string" && cards.some((c) => c.id === requested) ? requested : null;

  return (
    <>
      <Nav current="/practice" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <ExplainItBack cards={cards} initial={initial} aiGrading={aiStatus().available} />
      </main>
    </>
  );
}
