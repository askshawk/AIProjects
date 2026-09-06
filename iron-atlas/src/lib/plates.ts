/**
 * What to actually put on the bar.
 *
 * The app already tells a lifter *what weight* to use; between sets the real
 * question is which plates that means, and doing that arithmetic mid-session
 * with a phone in one hand is exactly the sort of thing software should
 * absorb. Competitors ship this; the numbers are already here.
 *
 * Kilo plates as found in most gyms. Bumper sets stop at 25, and 1.25 is the
 * smallest pair worth chasing — anything finer isn't reliably available.
 */
export const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export type PlateLoad = {
  /** Largest first, as you'd actually load them. */
  perSide: number[];
  /** Whether the plates hit the target exactly. */
  exact: boolean;
  /** What the plates above actually add up to, including the bar. */
  achievableKg: number;
};

/**
 * Greedy largest-first, which is both optimal for these denominations and how
 * anyone actually loads a bar.
 *
 * Returns null when the target can't be loaded at all — under the bar, or a
 * weight that isn't the bar plus a pair of plates. That's a real case
 * (dumbbell work, machines, a 22.5 kg prescription on a 20 kg bar) and
 * silently rounding it would put a different weight on the bar than the one
 * on screen.
 */
export function platesPerSide(
  totalKg: number,
  barKg: number,
): PlateLoad | null {
  if (!Number.isFinite(totalKg) || !Number.isFinite(barKg)) return null;
  if (totalKg < barKg) return null;

  // Plates go on in pairs, so only half the remainder is loaded per side.
  let remaining = (totalKg - barKg) / 2;
  if (remaining === 0) {
    return { perSide: [], exact: true, achievableKg: barKg };
  }

  const perSide: number[] = [];
  for (const plate of PLATE_SIZES_KG) {
    // Floating point: 0.1 tolerance is far below the smallest plate and keeps
    // values like 2.5000000000000004 from losing a plate.
    while (remaining >= plate - 0.0001) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const loaded = perSide.reduce((sum, p) => sum + p, 0);
  return {
    perSide,
    exact: Math.abs(remaining) < 0.0001,
    achievableKg: barKg + loaded * 2,
  };
}

/** "20 + 10 + 2.5" — collapses repeats to "2 × 20" so it reads at a glance. */
export function formatPlates(perSide: number[]): string {
  if (perSide.length === 0) return "just the bar";

  const counts: { plate: number; n: number }[] = [];
  for (const plate of perSide) {
    const last = counts.at(-1);
    if (last && last.plate === plate) last.n++;
    else counts.push({ plate, n: 1 });
  }
  return counts
    .map(({ plate, n }) => (n > 1 ? `${n} × ${plate}` : `${plate}`))
    .join(" + ");
}
