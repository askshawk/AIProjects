/**
 * Estimated one-rep max. Pure maths, no database — kept out of logbook.ts so
 * it can be imported anywhere and tested without a server boundary.
 */

/**
 * Epley. Every 1RM formula is an approximation and they diverge badly above
 * ~10 reps, so high-rep sets are excluded from comparison rather than being
 * silently flattered by the arithmetic.
 */
export function epley(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export const E1RM_REP_CEILING = 10;

/** Whether a set is a fair basis for an estimated max. */
export function countsTowardE1rm(
  weightKg: number | null,
  reps: number | null,
): boolean {
  return (
    weightKg !== null &&
    reps !== null &&
    weightKg > 0 &&
    reps > 0 &&
    reps <= E1RM_REP_CEILING
  );
}

/**
 * Tighter than E1RM_REP_CEILING. Epley's error grows with rep count, and a
 * training max computed from it feeds directly into next cycle's prescribed
 * weight — a 10-rep AMRAP overstates a max in a way that then compounds
 * (bigger TM → heavier prescription → an even harder AMRAP). Deriving a
 * training max only from low-rep sets keeps that loop from running away.
 */
export const TRAINING_MAX_REP_CEILING = 5;

/** Whether a set is strict enough evidence to move a training max. */
export function countsTowardTrainingMax(
  weightKg: number | null,
  reps: number | null,
): boolean {
  return (
    weightKg !== null &&
    reps !== null &&
    weightKg > 0 &&
    reps > 0 &&
    reps <= TRAINING_MAX_REP_CEILING
  );
}
