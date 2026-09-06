import Link from "next/link";
import {
  Pill,
  ProvenanceBadge,
  type Confidence,
} from "@/components/ProgramBadges";
import type { GymFit } from "@/lib/gymFit";

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
  firstParty?: boolean;
};

const equipmentLabel = (v: string) => v.replace(/_/g, " ");

/**
 * Whether this program runs as written in the reader's gym.
 *
 * Deliberately not phrased as a warning: needing a substitution is the normal
 * case and the app handles it. What a browser wants to know is which programs
 * they can run untouched, and what the others will change.
 */
function GymFitBadge({ fit }: { fit: GymFit }) {
  if (fit.kind === "unknown") return null;

  if (fit.kind === "fits") {
    return (
      <span
        title="Every movement in this program is one your gym can do."
        className="rounded border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
      >
        Fits your gym
      </span>
    );
  }

  return (
    <span
      title={`Your gym has no ${fit.missing
        .map(equipmentLabel)
        .join(" or ")}, so those movements get swapped for ones it can do.`}
      className="rounded border px-2 py-0.5 text-[11px] text-muted"
    >
      Swaps {fit.missing.map(equipmentLabel).join(", ")}
    </span>
  );
}

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
  fit = { kind: "unknown" },
}: {
  program: ProgramCardRow;
  showAuthor?: boolean;
  /** How this program lines up with the reader's saved gym. */
  fit?: GymFit;
}) {
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="block h-full rounded-lg border bg-surface p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium leading-tight">{p.title}</h2>
          {showAuthor && (
            <p className="text-sm text-muted">
              {p.firstParty ? p.authorName : `based on ${p.authorName}`}
            </p>
          )}
        </div>
        <ProvenanceBadge
          aiGenerated={p.aiGenerated}
          verified={p.verified}
          confidence={p.confidence ?? null}
          firstParty={p.firstParty}
        />
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{p.summary}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <GymFitBadge fit={fit} />
        <Pill>{label(p.goal)}</Pill>
        <Pill>{p.experienceLevel}</Pill>
        <Pill>{p.daysPerWeek} days/week</Pill>
        <Pill>{p.weeks} weeks</Pill>
        <Pill>{p.splitType}</Pill>
      </div>
    </Link>
  );
}
