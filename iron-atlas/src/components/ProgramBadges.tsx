import { notAffiliatedWith } from "@/lib/disclosure";

export type Confidence = "documented" | "partial" | "stylistic" | null;

const CONFIDENCE_BADGE: Record<
  NonNullable<Confidence>,
  { label: string; title: string; className: string }
> = {
  documented: {
    label: "Reconstructed",
    title:
      "Rebuilt by an AI, which reported specific recall of this program's published sets, reps and percentages. Still worth checking against the source.",
    className: "border-sky-800 bg-sky-950/50 text-sky-300",
  },
  partial: {
    label: "Partly inferred",
    title:
      "The overall structure is known, but some specifics were inferred rather than recalled. Check the details against the source before running it.",
    className: "border-amber-800 bg-amber-950/50 text-amber-300",
  },
  stylistic: {
    label: "In this style",
    title:
      "The AI knows this program exists and knows the author's methods, but not this program's actual contents — so this is written in their style rather than reproduced. Treat it as inspired-by, not as their program.",
    className: "border-orange-800 bg-orange-950/50 text-orange-300",
  },
};

/**
 * The provenance badge. Every library program says how it got here, because
 * the library is reconstructed by a model and pretending otherwise would be
 * the single most misleading thing this app could do.
 *
 * Faithfulness varies enormously across the library — published 5/3/1
 * percentages are well documented, while several paid programs aren't public
 * anywhere and can only be written *in an author's style*. Showing both under
 * one badge presented a guess and a near-transcript as the same claim, so the
 * badge now reflects the model's own assessment.
 */
export function ProvenanceBadge({
  aiGenerated,
  verified,
  confidence = null,
  firstParty = false,
}: {
  aiGenerated: boolean;
  verified: boolean;
  confidence?: Confidence;
  firstParty?: boolean;
}) {
  // Nothing is being reconstructed, so no fidelity claim applies — and saying
  // otherwise would attach a stranger's name to our own programming.
  if (firstParty) {
    return (
      <span
        title="Written for Iron Atlas. Not a reconstruction of anyone's published program."
        className="rounded border border-violet-800 bg-violet-950/50 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-violet-300"
      >
        Iron Atlas original
      </span>
    );
  }

  // A human reading it against the source outranks any self-assessment. Worded
  // as "source-checked" rather than "verified" because the latter, sitting next
  // to a coach's name, reads as though the coach endorsed it.
  if (verified) {
    return (
      <span
        title={`Checked against the original source by a human. ${notAffiliatedWith("the author")}`}
        className="rounded border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
      >
        Source-checked
      </span>
    );
  }

  if (!aiGenerated) return null;

  const style = confidence
    ? CONFIDENCE_BADGE[confidence]
    : {
        label: "AI-reconstructed",
        title:
          "Reconstructed by an AI from its knowledge of this program — check it against the source before trusting the details.",
        className: "border-amber-800 bg-amber-950/50 text-amber-300",
      };

  return (
    <span
      className={`rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${style.className}`}
      title={style.title}
    >
      {style.label}
    </span>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-surface-raised px-2 py-0.5 text-[11px] capitalize text-muted">
      {children}
    </span>
  );
}
