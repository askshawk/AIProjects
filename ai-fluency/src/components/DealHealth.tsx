import { DEAL_WIN_HEALTH } from "@/lib/games";

/** The deal health meter shared by scripted and live calls. */
export function DealHealth({ health }: { health: number }) {
  const tone = health >= DEAL_WIN_HEALTH ? "bg-good" : health >= 40 ? "bg-warn" : "bg-bad";
  return (
    <div>
      <div className="flex justify-between text-xs text-muted">
        <span>Deal health</span>
        <span className="tabular-nums">
          {health} <span className="sr-only">out of 100</span>
        </span>
      </div>
      <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-grid" role="meter" aria-valuenow={health} aria-valuemin={0} aria-valuemax={100} aria-label="Deal health">
        <div className={`h-full rounded-full transition-all duration-500 ${tone}`} style={{ width: `${health}%` }} />
        {/* Marks the line you need to finish above to close the deal. */}
        <div className="absolute inset-y-0 w-0.5 bg-foreground/40" style={{ left: `${DEAL_WIN_HEALTH}%` }} />
      </div>
    </div>
  );
}
