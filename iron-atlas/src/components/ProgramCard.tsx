import Link from "next/link";
import {
  Pill,
  ProvenanceBadge,
  type Confidence,
} from "@/components/ProgramBadges";

const label = (v: string) => v.replace(/_/g, " ");

export type ProgramCardRow = {
  slug: string;
  title: string;
  authorName: string;
  summary: string;
  goal: string;
  experienceLevel: string;
  daysPerWeek: number;
  weeks: number;
  splitType: string;
  aiGenerated: boolean;
  verified: boolean;
  confidence?: Confidence;
};

/**
 * One program in a list. Extracted so the browse page, author pages, and
 * anything else showing programs stay visually identical as the library grows.
 *
 * `showAuthor` is off on author pages, where repeating the name on every card
 * is just noise.
 */
export function ProgramCard({
  program: p,
  showAuthor = true,
}: {
  program: ProgramCardRow;
  showAuthor?: boolean;
}) {
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="block h-full rounded-lg border bg-surface p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium leading-tight">{p.title}</h2>
          {showAuthor && <p className="text-sm text-muted">{p.authorName}</p>}
        </div>
        <ProvenanceBadge
          aiGenerated={p.aiGenerated}
          verified={p.verified}
          confidence={p.confidence ?? null}
        />
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{p.summary}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        <Pill>{label(p.goal)}</Pill>
        <Pill>{p.experienceLevel}</Pill>
        <Pill>{p.daysPerWeek} days/week</Pill>
        <Pill>{p.weeks} weeks</Pill>
        <Pill>{p.splitType}</Pill>
      </div>
    </Link>
  );
}
