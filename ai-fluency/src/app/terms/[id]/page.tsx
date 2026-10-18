import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { StageBadge } from "@/components/StageBadge";
import { TermBody } from "@/components/TermBody";
import { TRACK_LABELS } from "@/lib/content";
import { findTerm, getAllTerms } from "@/lib/terms";
import { getAllProgress } from "@/lib/progress";
import { needsExplaining, stageOf } from "@/lib/srs";

export async function generateMetadata({ params }: PageProps<"/terms/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await findTerm(id))?.term ?? "Term" };
}

export default async function TermPage({ params }: PageProps<"/terms/[id]">) {
  await connection();
  const { id } = await params;
  const [terms, progress] = await Promise.all([getAllTerms(), getAllProgress()]);
  const term = terms.find((t) => t.id === id);
  if (!term) notFound();

  const state = progress.get(term.id);
  const related = term.related.map((r) => terms.find((t) => t.id === r)).filter((t) => t !== undefined);

  return (
    <>
      <Nav current="/terms" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Link href="/terms" className="text-sm text-muted hover:text-foreground">
          &larr; Glossary
        </Link>
        <article className="mt-3 rounded-2xl border bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted">
                {TRACK_LABELS[term.track]} · {term.topic}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{term.term}</h1>
              {term.aka && <p className="mt-1 text-sm text-muted">Also: {term.aka.join(", ")}</p>}
            </div>
            <StageBadge stage={stageOf(state)} />
          </div>
          {state && (
            <p className="mt-2 text-xs text-muted">
              Next review {state.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {state.lapses > 0 && ` · forgotten ${state.lapses} time${state.lapses === 1 ? "" : "s"}`}
              {state.explainedAt && " · explained in your own words"}
            </p>
          )}
          <Link
            href={`/practice/explain?term=${term.id}`}
            className={`mt-3 inline-block rounded-lg px-3 py-1.5 text-sm font-medium ${
              needsExplaining(state) ? "bg-accent text-white" : "border"
            }`}
          >
            {needsExplaining(state) ? "Explain it to master it" : "Explain it back"}
          </Link>

          <div className="mt-5">
            <TermBody term={term} />
          </div>

          <section className="mt-6 border-t pt-4 text-sm">
            <h2 className="font-medium">Sources</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {term.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
            {term.custom && <p className="mt-3 text-xs text-muted">Your card, from {term.custom.course} notes.</p>}
            {term.status === "draft" && !term.custom && (
              <p className="mt-3 text-xs text-muted">Draft card: not yet reviewed for accuracy.</p>
            )}
          </section>

          {related.length > 0 && (
            <section className="mt-4 text-sm">
              <h2 className="font-medium">Related</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {related.map((r) => (
                  <Link key={r.id} href={`/terms/${r.id}`} className="rounded-full border px-3 py-1 hover:bg-surface-raised">
                    {r.term}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>
    </>
  );
}
