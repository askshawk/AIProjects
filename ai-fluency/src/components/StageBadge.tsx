import type { Stage } from "@/lib/srs";

const STYLES: Record<Stage, string> = {
  new: "bg-surface-raised text-muted",
  learning: "bg-accent-soft text-accent",
  mastered: "bg-good/15 text-good",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[stage]}`}>
      {stage}
    </span>
  );
}
