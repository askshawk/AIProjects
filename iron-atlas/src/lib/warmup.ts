import { roundToPlate } from "@/lib/progression";

/**
 * Warm-up ramps.
 *
 * The point is to reach the working weight prepared rather than tired, so the
 * ramp gets heavier while the reps drop. These percentages are the ordinary
 * gym convention rather than anything proprietary — the value here is not
 * having to do the arithmetic with cold hands between sets.
 */

export type WarmupSet = { weightKg: number; reps: number; isBar: boolean };

/** An empty barbell. Warm-ups below this aren't loadable on a bar. */
/** Standard Olympic bar. Exported so the plate hint loads the same bar the
 *  warm-up ramp assumes. */
export const BAR_KG = 20;

const RAMP: { pct: number; reps: number }[] = [
  { pct: 0.4, reps: 5 },
  { pct: 0.6, reps: 3 },
  { pct: 0.8, reps: 2 },
  { pct: 0.9, reps: 1 },
];

/**
 * A warm-up ramp up to `workingKg`.
 *
 * Returns an empty ramp for light working weights — telling someone to warm up
 * to 30 kg with four progressively heavier sets is noise, and a warm-up
 * heavier than the work itself is worse than none.
 *
 * `barbell` controls whether the empty bar is included and whether the ramp is
 * floored at bar weight; dumbbell and machine work has no such floor.
 */
export function warmupSets(workingKg: number, barbell = true): WarmupSet[] {
  if (!Number.isFinite(workingKg) || workingKg <= 0) return [];
  // Below this there's nothing to ramp through.
  if (workingKg < (barbell ? BAR_KG * 2 : 20)) return [];

  const sets: WarmupSet[] = [];
  if (barbell) sets.push({ weightKg: BAR_KG, reps: 10, isBar: true });

  for (const step of RAMP) {
    const raw = workingKg * step.pct;
    if (barbell && raw <= BAR_KG) continue;
    const weightKg = roundToPlate(raw);
    // Skip a rung that rounded onto the previous one — two identical warm-up
    // sets read as a mistake.
    if (sets.some((s) => s.weightKg === weightKg)) continue;
    if (weightKg >= workingKg) continue;
    sets.push({ weightKg, reps: step.reps, isBar: false });
  }

  return sets;
}

/** "2:00" — mm:ss for a rest countdown. */
export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
