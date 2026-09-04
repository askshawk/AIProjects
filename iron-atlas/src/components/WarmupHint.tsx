"use client";

import { useState } from "react";
import { warmupSets } from "@/lib/warmup";

/**
 * The warm-up ramp for a working weight, collapsed by default.
 *
 * Shown only where there's a weight to ramp to — a warm-up suggestion with no
 * target is just clutter, and the ramp itself is arithmetic nobody should be
 * doing between sets.
 */
export function WarmupHint({
  workingKg,
  barbell = true,
}: {
  workingKg: number | null | undefined;
  barbell?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sets = workingKg == null ? [] : warmupSets(workingKg, barbell);
  if (sets.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 items-center text-xs text-muted transition-colors hover:text-accent"
      >
        {open ? "Hide warm-up" : `Warm-up (${sets.length} sets)`}
      </button>
      {open && (
        <p className="mt-1 font-mono text-xs text-muted">
          {sets
            .map((s) => `${s.isBar ? "bar" : s.weightKg} × ${s.reps}`)
            .join("  ·  ")}
        </p>
      )}
    </div>
  );
}
