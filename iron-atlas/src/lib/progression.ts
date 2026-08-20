import { epley } from "@/lib/e1rm";

/**
 * Turning last session into next session's numbers.
 *
 * Pure functions, no database — every rule here is a claim about how a program
 * is meant to be run, and those claims are worth testing directly.
 *
 * The guiding constraint: a suggestion is a *suggestion*. It always carries the
 * reasoning that produced it, it never silently invents a number when the
 * history doesn't support one, and it returns null rather than guessing. A
 * confidently wrong load recommendation is worse than no recommendation —
 * someone will put it on the bar.
 */

export type ProgressionScheme =
  | "linear"
  | "double_progression"
  | "wave_531"
  | "rpe_autoregulated"
  | "percentage_block"
  | "none";

export type LoggedSet = {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type Prescription = {
  sets: number;
  /** As written: "5", "8-12", "5+", "AMRAP". */
  reps: string;
  intensityType: string;
  intensityValue: string | null;
  /** Whether this trains a large multi-joint lift — drives increment size. */
  isCompound: boolean;
  /** Lower-body compounds progress in bigger jumps than upper-body ones. */
  isLowerBody: boolean;
};

export type Suggestion = {
  weightKg: number | null;
  reps: string;
  /** Why this number — shown to the lifter, never hidden. */
  reason: string;
};

/** Smallest jump most gyms can actually make: 1.25 kg plates a side. */
export const PLATE_INCREMENT = 2.5;

export function roundToPlate(kg: number, increment = PLATE_INCREMENT): number {
  return Math.round(kg / increment) * increment;
}

export type RepTarget = { min: number; max: number; isAmrap: boolean };

/**
 * Reads a prescription's rep field. Programs write these for humans — "8-12",
 * "5+", "AMRAP" — so this has to cope with all of it and admit when it can't.
 */
export function parseRepTarget(reps: string): RepTarget | null {
  const text = reps.trim().toLowerCase();
  if (text === "" ) return null;

  const isAmrap = text.includes("amrap") || text.includes("+");
  const numbers = text.match(/\d+/g);

  if (!numbers || numbers.length === 0) {
    // "AMRAP" with no number attached — a target exists but no count does.
    return isAmrap ? { min: 1, max: Infinity, isAmrap: true } : null;
  }

  const values = numbers.map(Number);
  return {
    min: values[0],
    max: isAmrap ? Infinity : (values[1] ?? values[0]),
    isAmrap,
  };
}

/** Working sets only — a blank row isn't a set that happened. */
function completed(sets: LoggedSet[]): LoggedSet[] {
  return sets.filter((s) => s.weightKg !== null && s.reps !== null);
}

/** The load actually used, when it was consistent across the session. */
function workingWeight(sets: LoggedSet[]): number | null {
  const done = completed(sets);
  if (done.length === 0) return null;
  // Top set is the honest reference for a ramped session.
  return Math.max(...done.map((s) => s.weightKg!));
}

/**
 * Linear progression: hit the target on every set, add weight; miss it, hold.
 * Three misses in a row is a stall, but we only see one session here, so the
 * suggestion says "repeat" rather than pretending to know the streak.
 */
function linear(prescribed: Prescription, last: LoggedSet[]): Suggestion | null {
  const target = parseRepTarget(prescribed.reps);
  const weight = workingWeight(last);
  if (!target || weight === null) return null;

  const done = completed(last);
  const allHit = done.length >= prescribed.sets && done.every((s) => s.reps! >= target.min);

  if (!allHit) {
    return {
      weightKg: weight,
      reps: prescribed.reps,
      reason: `You missed the target last time — repeat ${weight} kg before adding weight.`,
    };
  }

  const increment = prescribed.isLowerBody ? 5 : 2.5;
  const next = roundToPlate(weight + increment);
  return {
    weightKg: next,
    reps: prescribed.reps,
    reason: `All sets hit last time at ${weight} kg — add ${increment} kg.`,
  };
}

/**
 * Double progression: climb the rep range at a fixed load, then add weight and
 * drop back to the bottom of the range. The standard hypertrophy driver.
 */
function doubleProgression(prescribed: Prescription, last: LoggedSet[]): Suggestion | null {
  const target = parseRepTarget(prescribed.reps);
  const weight = workingWeight(last);
  if (!target || weight === null) return null;
  if (!Number.isFinite(target.max) || target.max === target.min) {
    // Not actually a range — fall back to linear rather than misapply the rule.
    return linear(prescribed, last);
  }

  const done = completed(last);
  const toppedOut =
    done.length >= prescribed.sets && done.every((s) => s.reps! >= target.max);

  if (toppedOut) {
    const increment = prescribed.isCompound ? (prescribed.isLowerBody ? 5 : 2.5) : 2.5;
    const next = roundToPlate(weight + increment);
    return {
      weightKg: next,
      reps: prescribed.reps,
      reason: `You hit ${target.max} on every set — add ${increment} kg and drop back to ${target.min} reps.`,
    };
  }

  const best = Math.max(...done.map((s) => s.reps!));
  return {
    weightKg: weight,
    reps: prescribed.reps,
    reason: `Stay at ${weight} kg and add reps — you're at ${best} of ${target.max}.`,
  };
}

/**
 * RPE-autoregulated: the lifter's reported effort sets the next load. Below
 * target means there was more in the tank; above means it was too heavy.
 */
function rpeAutoregulated(prescribed: Prescription, last: LoggedSet[]): Suggestion | null {
  const weight = workingWeight(last);
  const targetRpe = Number(prescribed.intensityValue);
  if (weight === null || !Number.isFinite(targetRpe)) return null;

  const rated = completed(last).filter((s) => s.rpe !== null);
  if (rated.length === 0) {
    return {
      weightKg: weight,
      reps: prescribed.reps,
      reason: `No RPE logged last time — repeat ${weight} kg and rate your sets to autoregulate.`,
    };
  }

  const avg = rated.reduce((sum, s) => sum + s.rpe!, 0) / rated.length;
  const delta = targetRpe - avg;

  // Roughly 1 RPE ≈ 3% of load near the top end. Deliberately conservative.
  if (Math.abs(delta) < 0.5) {
    return {
      weightKg: weight,
      reps: prescribed.reps,
      reason: `Last time averaged RPE ${avg.toFixed(1)} against a target of ${targetRpe} — hold at ${weight} kg.`,
    };
  }

  const next = roundToPlate(weight * (1 + 0.03 * delta));
  return {
    weightKg: next,
    reps: prescribed.reps,
    reason:
      delta > 0
        ? `RPE ${avg.toFixed(1)} was below the ${targetRpe} target — go up to ${next} kg.`
        : `RPE ${avg.toFixed(1)} was above the ${targetRpe} target — back off to ${next} kg.`,
  };
}

/**
 * Percentage-driven blocks (5/3/1 and friends) compute load from a training
 * max, not from last session. We don't ask the lifter to store a TM, so it's
 * derived from their best estimated max at the conventional 90%.
 */
function percentageBased(
  prescribed: Prescription,
  bestE1rm: number | null,
): Suggestion | null {
  const pct = Number(prescribed.intensityValue);
  if (!Number.isFinite(pct) || bestE1rm === null || bestE1rm <= 0) return null;

  const trainingMax = bestE1rm * 0.9;
  const next = roundToPlate(trainingMax * (pct / 100));
  return {
    weightKg: next,
    reps: prescribed.reps,
    reason: `${pct}% of a ${roundToPlate(trainingMax)} kg training max (90% of your best estimated ${bestE1rm.toFixed(1)} kg).`,
  };
}

/**
 * The one entry point. Returns null when the history can't support a number —
 * a first session, a missing load, an unparseable prescription.
 */
export function suggestNext(
  scheme: ProgressionScheme,
  prescribed: Prescription,
  last: LoggedSet[] | undefined,
  bestE1rm: number | null = null,
): Suggestion | null {
  // Percentage work doesn't need history, only an estimated max.
  if (
    prescribed.intensityType === "percent_1rm" &&
    (scheme === "wave_531" || scheme === "percentage_block" || bestE1rm !== null)
  ) {
    const fromPct = percentageBased(prescribed, bestE1rm);
    if (fromPct) return fromPct;
  }

  if (!last || completed(last).length === 0) return null;

  switch (scheme) {
    case "linear":
      return linear(prescribed, last);
    case "double_progression":
      return doubleProgression(prescribed, last);
    case "rpe_autoregulated":
      return rpeAutoregulated(prescribed, last);
    case "wave_531":
    case "percentage_block":
      // Percentage path already tried above; without a max there's nothing
      // honest to say, so repeat what was done.
      return {
        weightKg: workingWeight(last),
        reps: prescribed.reps,
        reason: "Log a heavier single or set to establish a max for percentage work.",
      };
    case "none":
    default:
      return null;
  }
}

/**
 * Whether an exercise loads the legs or back, which take bigger jumps than
 * upper-body lifts. Derived from the catalogue's muscle, not hardcoded names.
 */
export function isLowerBodyMuscle(primaryMuscle: string): boolean {
  return ["quads", "hamstrings", "glutes", "calves", "lower_back", "adductors", "abductors"].includes(
    primaryMuscle,
  );
}

/** Convenience for callers that already have an e1RM series. */
export function estimatedMax(sets: LoggedSet[]): number | null {
  const usable = completed(sets).filter((s) => s.reps! <= 10);
  if (usable.length === 0) return null;
  return Math.max(...usable.map((s) => epley(s.weightKg!, s.reps!)));
}
