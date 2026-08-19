import Link from "next/link";
import type { SwapPlan } from "@/lib/substitute";

const TIER_LABEL: Record<string, string> = {
  "same-muscle": "same target",
  "overlapping-muscle": "overlapping target",
  "same-pattern": "same pattern, different emphasis",
};

/**
 * Says exactly what was changed and what couldn't be. Silent substitution
 * would be worse than none — someone following a named program deserves to
 * know it isn't the named program any more.
 */
export function SwapNotice({ swaps }: { swaps: SwapPlan[] }) {
  if (swaps.length === 0) return null;

  const swapped = swaps.filter((s) => s.to);
  const stuck = swaps.filter((s) => !s.to);

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-soft/10 p-4 text-sm">
      <p className="font-medium">Adapted to your gym</p>

      {swapped.length > 0 && (
        <ul className="mt-2 space-y-1">
          {swapped.map((s) => (
            <li key={s.from.exerciseId} className="text-muted">
              <span className="line-through opacity-60">{s.from.exerciseName}</span>
              {" → "}
              <span className="text-foreground">{s.to!.name}</span>
              <span className="text-xs"> ({TIER_LABEL[s.to!.tier]})</span>
            </li>
          ))}
        </ul>
      )}

      {stuck.length > 0 && (
        <p className="mt-2 text-muted">
          No substitute for{" "}
          <span className="text-foreground">
            {stuck.map((s) => s.from.exerciseName).join(", ")}
          </span>
          . Nothing in the catalogue trains the same thing with your equipment — these are
          left as written.
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Based on{" "}
        <Link href="/gym" className="text-accent underline underline-offset-2">
          your gym
        </Link>
        . The spreadsheet download includes these swaps.
      </p>
    </div>
  );
}
