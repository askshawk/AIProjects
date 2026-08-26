import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { reviewQueue, suspiciouslyThin, verificationStats } from "@/lib/verification";

export const metadata = { title: "Review · Iron Atlas" };

/**
 * The review queue. The library is reconstructed by a model, so this is where
 * that gets checked — and the "needs a look first" list is ordered by how thin
 * a program is, because a reconstruction that lost most of its content is both
 * the worst failure and the easiest to spot.
 */
export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/programs/review");

  const [queue, stats, thin] = await Promise.all([
    reviewQueue(),
    verificationStats(),
    suspiciouslyThin(5),
  ]);

  const pct = stats.total ? Math.round((stats.verified / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {stats.verified} of {stats.total} programs verified ({pct}%). Everything else is an
          AI reconstruction that nobody has checked against the source yet.
        </p>
      </div>

      {thin.length > 0 && (
        <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4">
          <h2 className="text-sm font-medium text-amber-200">Look at these first</h2>
          <p className="mt-1 text-xs text-muted">
            Fewest prescribed sets relative to block length — the shape a bad reconstruction
            usually takes.
          </p>
          <ul className="mt-3 space-y-1.5">
            {thin.map((p) => (
              <li key={p.slug} className="flex items-baseline justify-between gap-3 text-sm">
                <Link href={`/programs/${p.slug}`} className="hover:text-accent">
                  {p.title}
                  <span className="ml-2 text-xs text-muted">{p.authorName}</span>
                </Link>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {p.prescribedSets} sets / {p.weeks}wk
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {queue.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted">
          Nothing awaiting review — every program in the library has been verified.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-surface">
          {queue.map((p) => (
            <li key={p.slug} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-3">
              <Link href={`/programs/${p.slug}`} className="font-medium hover:text-accent">
                {p.title}
              </Link>
              <span className="text-sm text-muted">{p.authorName}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                {p.prescribedSets} sets
                {p.sourceUrls.length > 0 && ` · ${p.sourceUrls.length} source`}
                {p.generatedModel && ` · ${p.generatedModel.replace("claude-", "")}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
