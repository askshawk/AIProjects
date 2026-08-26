import {
  and,
  cosineDistance,
  desc,
  eq,
  inArray,
  ne,
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { equipment as equipmentEnum, exercises } from "@/db/schema";

/**
 * The substitution engine.
 *
 * Rules decide *what is allowed*; embeddings only decide *what is closest*
 * among the allowed set. That ordering is the whole design. A pure vector
 * search over exercise names will cheerfully offer a Leg Extension in place of
 * a Back Squat — they're both "legs" — which is a useless answer to "my gym has
 * no squat rack". Matching movement pattern and compound/isolation first makes
 * every candidate a movement you could actually swap in; similarity then picks
 * the nearest one.
 *
 * The model never chooses a substitute. It may narrate one.
 */

export type Equipment = (typeof equipmentEnum.enumValues)[number];

export type GymProfile = {
  /** What the gym has. Empty means "assume everything" rather than "nothing". */
  equipment: Equipment[];
  /** Specific exercises to never prescribe — missing machines, injuries, dislikes. */
  bannedExerciseIds: number[];
};

export const EMPTY_GYM: GymProfile = { equipment: [], bannedExerciseIds: [] };

/** A full commercial gym — the sensible default when someone hasn't said. */
export const FULL_GYM: Equipment[] = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "bodyweight",
  "band",
  "kettlebell",
  "other",
];

export type SubstituteCandidate = {
  id: number;
  name: string;
  equipment: Equipment;
  primaryMuscle: string;
  similarity: number;
  /** How closely the swap preserves the original's intent. */
  tier: "same-muscle" | "overlapping-muscle" | "same-pattern";
};

export type ExerciseForSwap = {
  exerciseId: number;
  exerciseName: string;
  equipment: Equipment;
  primaryMuscle: string;
  isCompound: boolean;
  isExplosive: boolean;
};

/**
 * Whether the gym can perform this exercise at all. An empty equipment list
 * means the lifter hasn't told us, so nothing is blocked — never silently
 * filter someone's whole program because they skipped a settings page.
 */
export function canPerform(row: ExerciseForSwap, gym: GymProfile): boolean {
  if (gym.bannedExerciseIds.includes(row.exerciseId)) return false;
  if (gym.equipment.length === 0) return true;
  return gym.equipment.includes(row.equipment);
}

type Tier = {
  tier: SubstituteCandidate["tier"];
  /** Whether this tier is safe to try for a given movement pattern. */
  appliesTo: (pattern: string) => boolean;
  clauses: (row: ExerciseForSwap) => SQL[];
};

const TIERS: Tier[] = [
  {
    tier: "same-muscle",
    appliesTo: () => true,
    /** Same pattern, same target, same compound/isolation character. */
    clauses: (row) => [
      sql`${exercises.primaryMuscle} = ${row.primaryMuscle}`,
      eq(exercises.isCompound, row.isCompound),
    ],
  },
  {
    tier: "overlapping-muscle",
    appliesTo: () => true,
    /** Target appears as a secondary muscle — a near miss worth offering. */
    clauses: (row) => [
      sql`(${exercises.primaryMuscle} = ${row.primaryMuscle} or ${row.primaryMuscle} = any(${exercises.secondaryMuscles}))`,
      eq(exercises.isCompound, row.isCompound),
    ],
  },
  {
    tier: "same-pattern",
    /**
     * Last resort: right movement pattern, different emphasis. Deliberately
     * unavailable for `isolation`, which is a residual bucket rather than a
     * real pattern — without this guard a Lying Leg Curl resolves to a
     * Dumbbell Curl, because "curl" embeds close to "curl".
     */
    appliesTo: (pattern) => pattern !== "isolation",
    clauses: () => [],
  },
];

/**
 * Finds movements the gym can do that could stand in for this one, best first.
 * Returns an empty array rather than a bad suggestion — "nothing fits" is a
 * useful answer, and inventing a swap that trains something else is not.
 */
export async function findSubstitutes(
  row: ExerciseForSwap,
  gym: GymProfile,
  limit = 3,
): Promise<SubstituteCandidate[]> {
  const [original] = await db
    .select({
      embedding: exercises.embedding,
      movementPattern: exercises.movementPattern,
    })
    .from(exercises)
    .where(eq(exercises.id, row.exerciseId));

  if (!original?.embedding) return [];

  const similarity = sql<number>`1 - (${cosineDistance(exercises.embedding, original.embedding)})`;

  // Always-on constraints: right movement pattern, not the exercise we're
  // replacing, not something the lifter has ruled out, and performable here.
  const base = [
    sql`${exercises.movementPattern} = ${original.movementPattern}`,
    ne(exercises.id, row.exerciseId),
    // Never cross the speed/load line. A Box Jump shares pattern, muscle and
    // compound status with a Leg Press and is not a substitute for it.
    eq(exercises.isExplosive, row.isExplosive),
  ];
  if (gym.bannedExerciseIds.length > 0) {
    base.push(notInArray(exercises.id, gym.bannedExerciseIds));
  }
  if (gym.equipment.length > 0) {
    base.push(inArray(exercises.equipment, gym.equipment));
  }

  for (const { tier, appliesTo, clauses } of TIERS) {
    if (!appliesTo(original.movementPattern)) continue;

    const candidates = await db
      .select({
        id: exercises.id,
        name: exercises.name,
        equipment: exercises.equipment,
        primaryMuscle: exercises.primaryMuscle,
        similarity,
      })
      .from(exercises)
      .where(and(...base, ...clauses(row)))
      .orderBy(desc(similarity))
      .limit(limit);

    if (candidates.length > 0) {
      return candidates.map((c) => ({ ...c, tier }));
    }
  }

  return [];
}

export type SwapPlan = {
  from: ExerciseForSwap;
  to: SubstituteCandidate | null;
};

/**
 * Walks every distinct exercise in a program and plans a swap for the ones the
 * gym can't do. Deduplicated by exercise, because a program prescribes the
 * same movement across many days and it must be swapped consistently — half a
 * program on hack squats and half on V-squats is worse than either.
 */
export async function planSwaps(
  rows: ExerciseForSwap[],
  gym: GymProfile,
): Promise<Map<number, SwapPlan>> {
  const blocked = new Map<number, ExerciseForSwap>();
  for (const row of rows) {
    if (!canPerform(row, gym)) blocked.set(row.exerciseId, row);
  }

  const plans = new Map<number, SwapPlan>();
  for (const [id, row] of blocked) {
    const [best] = await findSubstitutes(row, gym, 1);
    plans.set(id, { from: row, to: best ?? null });
  }
  return plans;
}
