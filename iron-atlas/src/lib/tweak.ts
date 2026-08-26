import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  userPrograms,
} from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";
import { findSubstitutes, type GymProfile } from "@/lib/substitute";

/**
 * Edits to a lifter's own copy of a program.
 *
 * Every function here is scoped to a `userProgramId` that the caller has
 * already proven belongs to the signed-in user, and every write is filtered on
 * ownership again at the SQL level. Library templates are never touched — that
 * separation is the one architectural rule this app has, and chat-driven edits
 * are exactly where it would otherwise get violated.
 *
 * Each edit returns a human-readable diff. The model narrates it; it does not
 * get to decide what happened.
 */

export type TweakChange = { before: string; after: string };
export type TweakResult =
  | { ok: true; summary: string; changes: TweakChange[] }
  | { ok: false; reason: string };

/** Confirms the fork is this user's before anything mutates. */
async function ownedFork(userProgramId: number, userId: number) {
  const [fork] = await db
    .select({ id: userPrograms.id, title: userPrograms.title })
    .from(userPrograms)
    .where(and(eq(userPrograms.id, userProgramId), eq(userPrograms.userId, userId)));
  return fork ?? null;
}

/** Every prescription row in a fork, with its exercise and day context. */
async function prescriptionsIn(userProgramId: number) {
  return db
    .select({
      id: userProgramExercises.id,
      exerciseId: userProgramExercises.exerciseId,
      exerciseName: exercises.name,
      isExplosive: exercises.isExplosive,
      sets: userProgramExercises.sets,
      reps: userProgramExercises.reps,
      dayName: userProgramDays.name,
      weekNumber: userProgramWeeks.weekNumber,
    })
    .from(userProgramExercises)
    .innerJoin(exercises, eq(exercises.id, userProgramExercises.exerciseId))
    .innerJoin(userProgramDays, eq(userProgramDays.id, userProgramExercises.dayId))
    .innerJoin(userProgramWeeks, eq(userProgramWeeks.id, userProgramDays.weekId))
    .where(eq(userProgramWeeks.userProgramId, userProgramId))
    .orderBy(asc(userProgramWeeks.weekNumber), asc(userProgramDays.dayIndex));
}

/**
 * Swaps one movement for another everywhere it appears in the fork.
 *
 * Programs repeat exercises across weeks, so replacing a single occurrence
 * leaves the lifter with a program that contradicts itself. Whole-fork is the
 * only sane default.
 */
export async function swapExercise(
  userProgramId: number,
  userId: number,
  fromName: string,
  toName: string,
): Promise<TweakResult> {
  if (!(await ownedFork(userProgramId, userId))) return { ok: false, reason: "not your program" };

  const [from, to] = await Promise.all([
    resolveExerciseName(fromName),
    resolveExerciseName(toName),
  ]);
  if (!from) return { ok: false, reason: `"${fromName}" isn't in the exercise catalogue` };
  if (!to) return { ok: false, reason: `"${toName}" isn't in the exercise catalogue` };
  if (from.id === to.id) return { ok: false, reason: "those are the same exercise" };

  const rows = (await prescriptionsIn(userProgramId)).filter((r) => r.exerciseId === from.id);
  if (rows.length === 0) {
    return { ok: false, reason: `${from.name} isn't in this program` };
  }

  await db
    .update(userProgramExercises)
    .set({ exerciseId: to.id, substitutedFromExerciseId: from.id })
    .where(
      inArray(
        userProgramExercises.id,
        rows.map((r) => r.id),
      ),
    );

  return {
    ok: true,
    summary: `Swapped ${from.name} for ${to.name} in ${rows.length} place${rows.length === 1 ? "" : "s"}.`,
    changes: rows.map((r) => ({
      before: `${r.dayName}: ${from.name} ${r.sets}×${r.reps}`,
      after: `${r.dayName}: ${to.name} ${r.sets}×${r.reps}`,
    })),
  };
}

/**
 * Scales set counts for one exercise, or the whole program.
 *
 * Clamped to 1–20 working sets. Volume is where an enthusiastic model can do
 * real damage — "double my chest volume" three times over is an injury, not a
 * program — so the ceiling is enforced here rather than trusted to the prompt.
 */
export async function adjustVolume(
  userProgramId: number,
  userId: number,
  opts: { exerciseName?: string; deltaSets?: number; multiplier?: number },
): Promise<TweakResult> {
  if (!(await ownedFork(userProgramId, userId))) return { ok: false, reason: "not your program" };
  if (opts.deltaSets == null && opts.multiplier == null) {
    return { ok: false, reason: "no change requested" };
  }

  let target: { id: number; name: string } | null = null;
  if (opts.exerciseName) {
    const resolved = await resolveExerciseName(opts.exerciseName);
    if (!resolved) return { ok: false, reason: `"${opts.exerciseName}" isn't in the catalogue` };
    target = { id: resolved.id, name: resolved.name };
  }

  const rows = (await prescriptionsIn(userProgramId)).filter(
    (r) => !target || r.exerciseId === target.id,
  );
  if (rows.length === 0) {
    return { ok: false, reason: target ? `${target.name} isn't in this program` : "nothing to change" };
  }

  const changes: TweakChange[] = [];
  for (const row of rows) {
    const raw =
      opts.multiplier != null ? row.sets * opts.multiplier : row.sets + (opts.deltaSets ?? 0);
    const next = Math.max(1, Math.min(20, Math.round(raw)));
    if (next === row.sets) continue;

    await db
      .update(userProgramExercises)
      .set({ sets: next })
      .where(eq(userProgramExercises.id, row.id));

    changes.push({
      before: `${row.dayName}: ${row.exerciseName} ${row.sets}×${row.reps}`,
      after: `${row.dayName}: ${row.exerciseName} ${next}×${row.reps}`,
    });
  }

  if (changes.length === 0) return { ok: false, reason: "that would leave every set unchanged" };

  return {
    ok: true,
    summary: `Adjusted volume on ${changes.length} prescription${changes.length === 1 ? "" : "s"}${target ? ` for ${target.name}` : ""}.`,
    changes,
  };
}

/** Drops an exercise from the fork entirely. */
export async function removeExercise(
  userProgramId: number,
  userId: number,
  exerciseName: string,
): Promise<TweakResult> {
  if (!(await ownedFork(userProgramId, userId))) return { ok: false, reason: "not your program" };

  const resolved = await resolveExerciseName(exerciseName);
  if (!resolved) return { ok: false, reason: `"${exerciseName}" isn't in the catalogue` };

  const rows = (await prescriptionsIn(userProgramId)).filter(
    (r) => r.exerciseId === resolved.id,
  );
  if (rows.length === 0) return { ok: false, reason: `${resolved.name} isn't in this program` };

  await db.delete(userProgramExercises).where(
    inArray(
      userProgramExercises.id,
      rows.map((r) => r.id),
    ),
  );

  return {
    ok: true,
    summary: `Removed ${resolved.name} from ${rows.length} session${rows.length === 1 ? "" : "s"}.`,
    changes: rows.map((r) => ({
      before: `${r.dayName}: ${resolved.name} ${r.sets}×${r.reps}`,
      after: `${r.dayName}: (removed)`,
    })),
  };
}

/** Adds an exercise to the end of one training day. */
export async function addExercise(
  userProgramId: number,
  userId: number,
  opts: { dayName: string; exerciseName: string; sets: number; reps: string },
): Promise<TweakResult> {
  if (!(await ownedFork(userProgramId, userId))) return { ok: false, reason: "not your program" };

  const resolved = await resolveExerciseName(opts.exerciseName);
  if (!resolved) return { ok: false, reason: `"${opts.exerciseName}" isn't in the catalogue` };

  const days = await db
    .select({ id: userProgramDays.id, name: userProgramDays.name })
    .from(userProgramDays)
    .innerJoin(userProgramWeeks, eq(userProgramWeeks.id, userProgramDays.weekId))
    .where(eq(userProgramWeeks.userProgramId, userProgramId));

  const needle = opts.dayName.toLowerCase();
  const matched = days.filter((d) => d.name.toLowerCase().includes(needle));
  if (matched.length === 0) {
    return { ok: false, reason: `no day matching "${opts.dayName}" — days are: ${days.map((d) => d.name).join(", ")}` };
  }

  const sets = Math.max(1, Math.min(20, Math.round(opts.sets)));
  const changes: TweakChange[] = [];

  for (const day of matched) {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${userProgramExercises.order}), -1)::int + 1` })
      .from(userProgramExercises)
      .where(eq(userProgramExercises.dayId, day.id));

    await db.insert(userProgramExercises).values({
      dayId: day.id,
      exerciseId: resolved.id,
      order: next,
      sets,
      reps: opts.reps,
      intensityType: "none",
    });

    changes.push({ before: `${day.name}: —`, after: `${day.name}: ${resolved.name} ${sets}×${opts.reps}` });
  }

  return {
    ok: true,
    summary: `Added ${resolved.name} ${sets}×${opts.reps} to ${changes.length} session${changes.length === 1 ? "" : "s"}.`,
    changes,
  };
}

/**
 * Substitute candidates for a movement in the fork, ranked by the existing
 * deterministic engine. Read-only: the model suggests, the lifter chooses, and
 * `swapExercise` is what actually writes.
 */
export async function suggestSwaps(
  userProgramId: number,
  userId: number,
  exerciseName: string,
  gym: GymProfile,
) {
  if (!(await ownedFork(userProgramId, userId))) return { ok: false as const, reason: "not your program" };

  const resolved = await resolveExerciseName(exerciseName);
  if (!resolved) return { ok: false as const, reason: `"${exerciseName}" isn't in the catalogue` };

  const [row] = await db
    .select({
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      equipment: exercises.equipment,
      primaryMuscle: exercises.primaryMuscle,
      isCompound: exercises.isCompound,
      isExplosive: exercises.isExplosive,
    })
    .from(exercises)
    .where(eq(exercises.id, resolved.id));

  const candidates = await findSubstitutes(row, gym);
  return { ok: true as const, original: resolved.name, candidates };
}
