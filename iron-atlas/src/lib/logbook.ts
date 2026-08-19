import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { countsTowardE1rm, epley } from "@/lib/e1rm";
import {
  exercises,
  setLogs,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  workoutSessions,
} from "@/db/schema";

export { epley, countsTowardE1rm, E1RM_REP_CEILING } from "@/lib/e1rm";

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
      equipment: exercises.equipment,
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
        sql`${setLogs.exerciseId} = any(${sql.raw(`array[${exerciseIds.join(",")}]::int[]`)})`,
        eq(setLogs.isWarmup, false),
      ),
    );

  const latest = new Map<number, { sessionId: number; performedAt: Date }>();
  for (const row of recent) {
    if (row.rank === 1) {
      latest.set(row.exerciseId, { sessionId: row.sessionId, performedAt: row.performedAt });
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
        sql`${setLogs.sessionId} = any(${sql.raw(`array[${sessionIds.join(",")}]::int[]`)})`,
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

export type BestSet = { weightKg: number; reps: number; e1rm: number; performedAt: Date };

/** The lifter's best estimated max per exercise, for PR detection. */
export async function personalBests(
  userId: number,
  exerciseIds: number[],
): Promise<Map<number, BestSet>> {
  if (exerciseIds.length === 0) return new Map();

  const rows = await db
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
        sql`${setLogs.exerciseId} = any(${sql.raw(`array[${exerciseIds.join(",")}]::int[]`)})`,
        eq(setLogs.isWarmup, false),
      ),
    )
    .orderBy(desc(workoutSessions.performedAt));

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
