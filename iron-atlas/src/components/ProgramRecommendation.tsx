import Link from "next/link";
import type { Recommendation } from "@/lib/recommend";
import { Pill, ProvenanceBadge } from "@/components/ProgramBadges";

/**
 * Renders the tool's actual return value rather than asking the model to
 * describe it in prose. The card links to the real program and its real
 * spreadsheet, so nothing here can drift from what's in the database.
 */
export function ProgramRecommendation({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted">
        Nothing in the library matched.
      </p>
    );
  }

  const [top, ...rest] = recommendations;

  return (
    <div className="space-y-2">
      <Card rec={top} featured />
      {rest.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {rest.map((rec) => (
            <Card key={rec.slug} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ rec, featured = false }: { rec: Recommendation; featured?: boolean }) {
  return (
    <div
      className={`rounded-lg border bg-surface p-3 ${
        featured ? "border-accent/50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/programs/${rec.slug}`}
            className="font-medium leading-tight hover:text-accent"
          >
            {rec.title}
          </Link>
          <p className="truncate text-xs text-muted">{rec.authorName}</p>
        </div>
        {featured && <ProvenanceBadge aiGenerated={rec.aiGenerated} verified={rec.verified} />}
      </div>

      {featured && <p className="mt-2 text-sm text-muted">{rec.summary}</p>}

      <div className="mt-2 flex flex-wrap gap-1">
        <Pill>{rec.daysPerWeek} days/week</Pill>
        <Pill>{rec.weeks} weeks</Pill>
        {featured && <Pill>{rec.splitType}</Pill>}
      </div>

      {featured && (
        <>
          {rec.matched.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Matched on {rec.matched.join(", ")} · {Math.round(rec.similarity * 100)}% fit
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/programs/${rec.slug}`}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black"
            >
              View program
            </Link>
            <a
              href={`/api/programs/${rec.slug}/export`}
              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:border-accent/60"
            >
              Download spreadsheet
            </a>
          </div>
        </>
      )}
    </div>
  );
}
