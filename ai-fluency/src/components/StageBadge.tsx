import type { Stage } from "@/lib/srs";

const STYLES: Record<Stage, string> = {
  new: "bg-surface-raised text-muted",
  // Same hues as the mastery chart: orange for learning, violet for mastered.
  learning: "bg-viz-2/15 text-foreground",
  mastered: "bg-viz-1/15 text-foreground",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[stage]}`}>
      {stage}
    </span>
  );
}
