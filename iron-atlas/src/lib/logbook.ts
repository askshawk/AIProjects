import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { countsTowardE1rm, countsTowardTrainingMax, epley } from "@/lib/e1rm";
import {
  exercises,
  setLogs,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  workoutSessions,
} from "@/db/schema";

export {
  epley,
  countsTowardE1rm,
  E1RM_REP_CEILING,
  countsTowardTrainingMax,
  TRAINING_MAX_REP_CEILING,
} from "@/lib/e1rm";

/** Days in the fork, in order, with their week context. */
export async function programDaysFor(userProgramId: number) {
  return db
    .select({
      dayId: userProgramDays.id,
      dayIndex: userProgramDays.dayIndex,
      dayName: userProgramDays.name,
      dayNotes: userProgramDays.notes,
      weekNumber: userProgramWeeks.weekNumber,
      weekLabel: userProgramWeeks.label,
      repeatCount: userProgramWeeks.repeatCount,
    })
    .from(userProgramWeeks)
    .innerJoin(userProgramDays, eq(userProgramDays.weekId, userProgramWeeks.id))
    .where(eq(userProgramWeeks.userProgramId, userProgramId))
    .orderBy(asc(userProgramWeeks.weekNumber), asc(userProgramDays.dayIndex));
}

/** The prescription for one training day. */
export async function prescriptionFor(dayId: number) {
  return db
    .select({
      id: userProgramExercises.id,
      exerciseId: userProgramExercises.exerciseId,
      exerciseName: exercises.name,
      exerciseSlug: exercises.slug,
      exerciseDescription: exercises.description,
      equipment: exercises.equipment,
      primaryMuscle: exercises.primaryMuscle,
      isCompound: exercises.isCompound,
      order: userProgramExercises.order,
      sets: userProgramExercises.sets,
      reps: userProgramExercises.reps,
      intensityType: userProgramExercises.intensityType,
      intensityValue: userProgramExercises.intensityValue,
      restSeconds: userProgramExercises.restSeconds,
      notes: userProgramExercises.notes,
      supersetGroup: userProgramExercises.supersetGroup,
      substitutedFrom: userProgramExercises.substitutedFromExerciseId,
    })
    .from(userProgramExercises)
    .innerJoin(exercises, eq(exercises.id, userProgramExercises.exerciseId))
    .where(eq(userProgramExercises.dayId, dayId))
    .orderBy(asc(userProgramExercises.order));
}

export type LastPerformance = {
  performedAt: Date;
  sets: { weightKg: number | null; reps: number | null; rpe: number | null }[];
};

/**
 * What the lifter did the last time they trained each of these movements.
 *
 * This is the number that actually matters in the gym — "what did I do last
 * time" is the question every working set starts with, and making someone
 * scroll their history to find it is the difference between a logbook they use
 * and one they abandon.
 */
export async function lastPerformances(
  userId: number,
  exerciseIds: number[],
): Promise<Map<number, LastPerformance>> {
  if (exerciseIds.length === 0) return new Map();

  // The most recent session per exercise, then that session's sets.
  const recent = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      performedAt: workoutSessions.performedAt,
      // Cast to int: row_number() is bigint, which postgres.js hands back as a
      // *string*, so `rank === 1` silently never matched and every lifter's
      // "last time" numbers came back empty.
      rank: sql<number>`(row_number() over (
        partition by ${setLogs.exerciseId}
        order by ${workoutSessions.performedAt} desc
      ))::int`.as("rank"),
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        inArray(setLogs.exerciseId, exerciseIds),
        eq(setLogs.isWarmup, false),
      ),
    );

  const latest = new Map<number, { sessionId: number; performedAt: Date }>();
  for (const row of recent) {
    if (row.rank === 1) {
      latest.set(row.exerciseId, {
        sessionId: row.sessionId,
        performedAt: row.performedAt,
      });
    }
  }
  if (latest.size === 0) return new Map();

  const sessionIds = [...new Set([...latest.values()].map((v) => v.sessionId))];
  const sets = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      setIndex: setLogs.setIndex,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rpe: setLogs.rpe,
    })
    .from(setLogs)
    .where(
      and(
        inArray(setLogs.sessionId, sessionIds),
        eq(setLogs.isWarmup, false),
      ),
    )
    .orderBy(asc(setLogs.setIndex));

  const out = new Map<number, LastPerformance>();
  for (const [exerciseId, { sessionId, performedAt }] of latest) {
    out.set(exerciseId, {
      performedAt,
      sets: sets
        .filter((s) => s.exerciseId === exerciseId && s.sessionId === sessionId)
        .map((s) => ({
          weightKg: s.weightKg === null ? null : Number(s.weightKg),
          reps: s.reps,
          rpe: s.rpe === null ? null : Number(s.rpe),
        })),
    });
  }
  return out;
}

/**
 * The last few sessions per exercise, most recent first — what
 * `lastPerformances` gives you for one session, extended across several.
 *
 * This exists for stall detection: whether a lifter hit the target *last*
 * time only supports "hold or add weight". Telling a lifter to deload
 * instead needs to see a streak, which means looking past just the most
 * recent session.
 */
export async function recentPerformances(
  userId: number,
  exerciseIds: number[],
  sessionLimit = 3,
): Promise<Map<number, LastPerformance[]>> {
  if (exerciseIds.length === 0) return new Map();

  const recent = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      performedAt: workoutSessions.performedAt,
      // dense_rank, NOT row_number: this ranks *sessions*, and every set
      // logged in the same session has to share a rank. With row_number, one
      // session of three sets occupied ranks 1-3 by itself, so a single
      // missed session was read downstream as three consecutive stalls and
      // triggered a deload (progression.ts's `stalled` check).
      // sessionId breaks ties so two sessions sharing a timestamp still rank
      // separately rather than collapsing into one.
      rank: sql<number>`(dense_rank() over (
        partition by ${setLogs.exerciseId}
        order by ${workoutSessions.performedAt} desc, ${setLogs.sessionId} desc
      ))::int`.as("rank"),
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        inArray(setLogs.exerciseId, exerciseIds),
        eq(setLogs.isWarmup, false),
      ),
    );

  const windows = new Map<
    number,
    { sessionId: number; performedAt: Date; rank: number }[]
  >();
  // One entry per (exercise, session). The query returns a row per logged
  // set, and they now share a rank, so without this a 3-set session would
  // still be pushed three times.
  const seen = new Set<string>();
  for (const row of recent) {
    if (row.rank > sessionLimit) continue;
    const key = `${row.exerciseId}:${row.sessionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = windows.get(row.exerciseId) ?? [];
    list.push(row);
    windows.set(row.exerciseId, list);
  }
  if (windows.size === 0) return new Map();

  const sessionIds = [
    ...new Set(
      [...windows.values()].flatMap((rows) => rows.map((r) => r.sessionId)),
    ),
  ];
  const sets = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      setIndex: setLogs.setIndex,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      rpe: setLogs.rpe,
    })
    .from(setLogs)
    .where(
      and(
        inArray(setLogs.sessionId, sessionIds),
        eq(setLogs.isWarmup, false),
      ),
    )
    .orderBy(asc(setLogs.setIndex));

  const out = new Map<number, LastPerformance[]>();
  for (const [exerciseId, rows] of windows) {
    const sorted = [...rows].sort((a, b) => a.rank - b.rank);
    out.set(
      exerciseId,
      sorted.map(({ sessionId, performedAt }) => ({
        performedAt,
        sets: sets
          .filter(
            (s) => s.exerciseId === exerciseId && s.sessionId === sessionId,
          )
          .map((s) => ({
            weightKg: s.weightKg === null ? null : Number(s.weightKg),
            reps: s.reps,
            rpe: s.rpe === null ? null : Number(s.rpe),
          })),
      })),
    );
  }
  return out;
}

export type BestSet = {
  weightKg: number;
  reps: number;
  e1rm: number;
  performedAt: Date;
};

/** Every logged working set across these exercises, newest first — the raw
 * material both `personalBests` and `trainingMaxBasis` filter down from. */
async function loggedSetHistory(userId: number, exerciseIds: number[]) {
  if (exerciseIds.length === 0) return [];

  return db
    .select({
      exerciseId: setLogs.exerciseId,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      performedAt: workoutSessions.performedAt,
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        eq(workoutSessions.userId, userId),
        inArray(setLogs.exerciseId, exerciseIds),
        eq(setLogs.isWarmup, false),
      ),
    )
    .orderBy(desc(workoutSessions.performedAt));
}

/** The lifter's best estimated max per exercise, for PR detection. */
export async function personalBests(
  userId: number,
  exerciseIds: number[],
): Promise<Map<number, BestSet>> {
  const rows = await loggedSetHistory(userId, exerciseIds);

  const best = new Map<number, BestSet>();
  for (const row of rows) {
    const weight = row.weightKg === null ? null : Number(row.weightKg);
    if (!countsTowardE1rm(weight, row.reps)) continue;

    const e1rm = epley(weight!, row.reps!);
    const current = best.get(row.exerciseId);
    if (!current || e1rm > current.e1rm) {
      best.set(row.exerciseId, {
        weightKg: weight!,
        reps: row.reps!,
        e1rm,
        performedAt: row.performedAt,
      });
    }
  }
  return best;
}

export type TrainingMaxBasis = {
  /** The best low-rep estimated max on record. */
  current: BestSet;
  /**
   * The best low-rep estimated max *before* that record was set — i.e. the
   * runner-up. `suggestNext`'s percentage-based path uses this to cap how
   * much a single PR is allowed to move next cycle's prescribed weight, so a
   * great day doesn't compound into a heavier and heavier AMRAP.
   */
  previous: BestSet | null;
};

/**
 * Like `personalBests`, but restricted to sets of `TRAINING_MAX_REP_CEILING`
 * reps or fewer, and keeping the runner-up alongside the record. This is the
 * only e1RM feed that's safe to prescribe *from* — `personalBests` stays
 * looser (up to 10 reps) because it only drives PR display, not a number
 * that ends up on a bar.
 */
export async function trainingMaxBasis(
  userId: number,
  exerciseIds: number[],
): Promise<Map<number, TrainingMaxBasis>> {
  const rows = await loggedSetHistory(userId, exerciseIds);

  const byExercise = new Map<number, BestSet[]>();
  for (const row of rows) {
    const weight = row.weightKg === null ? null : Number(row.weightKg);
    if (!countsTowardTrainingMax(weight, row.reps)) continue;

    const list = byExercise.get(row.exerciseId) ?? [];
    list.push({
      weightKg: weight!,
      reps: row.reps!,
      e1rm: epley(weight!, row.reps!),
      performedAt: row.performedAt,
    });
    byExercise.set(row.exerciseId, list);
  }

  const out = new Map<number, TrainingMaxBasis>();
  for (const [exerciseId, sets] of byExercise) {
    const sorted = [...sets].sort((a, b) => b.e1rm - a.e1rm);
    const current = sorted[0];

    /**
     * The best set from a session *strictly earlier* than the record's —
     * i.e. what the max stood at before this PR happened.
     *
     * This used to be `sorted[1]`, the second-best set overall, which on a
     * good day is simply another set from the same session. That made the
     * ratchet cap in progression.ts useless: the ceiling it computes
     * (previous × 0.9 + increment) landed just above the new candidate, so it
     * never bound and a single big session raised the training max in full —
     * exactly the runaway the cap exists to prevent.
     */
    const recordSession = current.performedAt.getTime();
    const earlier = sets.filter(
      (s) => s.performedAt.getTime() < recordSession,
    );
    const previous = earlier.length
      ? earlier.reduce((best, s) => (s.e1rm > best.e1rm ? s : best))
      : null;

    out.set(exerciseId, { current, previous });
  }
  return out;
}
