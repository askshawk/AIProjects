import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
  userProgramDays,
  userProgramExercises,
  userProgramWeeks,
  userPrograms,
} from "@/db/schema";
import { planSwaps, type GymProfile } from "@/lib/substitute";

/**
 * Forking a library program.
 *
 * Templates are immutable — this deep-copies one into the user_program_* tables
 * so tweaks, substitutions, and logged sets all hang off a private copy.
 * Correcting or regenerating a library program can never disturb someone
 * mid-block, and `sourceProgramId` / `sourceExerciseId` keep the ancestry so
 * the UI can always show what was changed from the original.
 *
 * Gym substitutions are baked in at fork time rather than applied on every
 * read: the program you started is the program you keep, even if you later
 * buy a squat rack.
 */
export async function forkProgram(
  userId: number,
  slug: string,
  gym: GymProfile,
): Promise<number | null> {
  const [program] = await db
    .select({
      id: programs.id,
      title: programs.title,
      authorName: programs.authorName,
      progression: programs.progression,
    })
    .from(programs)
    .where(eq(programs.slug, slug));

  if (!program) return null;

  const sourceRows = await db
    .select({
      weekId: programWeeks.id,
      weekNumber: programWeeks.weekNumber,
      weekLabel: programWeeks.label,
      weekNotes: programWeeks.notes,
      repeatCount: programWeeks.repeatCount,
      dayId: programDays.id,
      dayIndex: programDays.dayIndex,
      dayName: programDays.name,
      dayNotes: programDays.notes,
      peId: programExercises.id,
      order: programExercises.order,
      sets: programExercises.sets,
      reps: programExercises.reps,
      intensityType: programExercises.intensityType,
      intensityValue: programExercises.intensityValue,
      tempo: programExercises.tempo,
      restSeconds: programExercises.restSeconds,
      notes: programExercises.notes,
      supersetGroup: programExercises.supersetGroup,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      equipment: exercises.equipment,
      primaryMuscle: exercises.primaryMuscle,
      isCompound: exercises.isCompound,
      isExplosive: exercises.isExplosive,
    })
    .from(programWeeks)
    .innerJoin(programDays, eq(programDays.weekId, programWeeks.id))
    .innerJoin(programExercises, eq(programExercises.dayId, programDays.id))
    .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
    .where(eq(programWeeks.programId, program.id))
    .orderBy(
      asc(programWeeks.weekNumber),
      asc(programDays.dayIndex),
      asc(programExercises.order),
    );

  if (sourceRows.length === 0) return null;

  const swaps = await planSwaps(sourceRows, gym);

  return db.transaction(async (tx) => {
    const [fork] = await tx
      .insert(userPrograms)
      .values({
        userId,
        sourceProgramId: program.id,
        title: program.title,
        authorName: program.authorName,
        progression: program.progression,
        status: "active",
      })
      .returning({ id: userPrograms.id });

    const weekIds = new Map<number, number>();
    const dayIds = new Map<number, number>();

    for (const row of sourceRows) {
      if (!weekIds.has(row.weekId)) {
        const [week] = await tx
          .insert(userProgramWeeks)
          .values({
            userProgramId: fork.id,
            weekNumber: row.weekNumber,
            label: row.weekLabel,
            notes: row.weekNotes,
            repeatCount: row.repeatCount,
          })
          .returning({ id: userProgramWeeks.id });
        weekIds.set(row.weekId, week.id);
      }

      if (!dayIds.has(row.dayId)) {
        const [day] = await tx
          .insert(userProgramDays)
          .values({
            weekId: weekIds.get(row.weekId)!,
            sourceDayId: row.dayId,
            dayIndex: row.dayIndex,
            name: row.dayName,
            notes: row.dayNotes,
          })
          .returning({ id: userProgramDays.id });
        dayIds.set(row.dayId, day.id);
      }

      const swap = swaps.get(row.exerciseId);
      const swapped = swap?.to ?? null;

      await tx.insert(userProgramExercises).values({
        dayId: dayIds.get(row.dayId)!,
        exerciseId: swapped?.id ?? row.exerciseId,
        sourceProgramExerciseId: row.peId,
        substitutedFromExerciseId: swapped ? row.exerciseId : null,
        order: row.order,
        sets: row.sets,
        reps: row.reps,
        intensityType: row.intensityType,
        intensityValue: row.intensityValue,
        tempo: row.tempo,
        restSeconds: row.restSeconds,
        notes: row.notes,
        supersetGroup: row.supersetGroup,
      });
    }

    return fork.id;
  });
}

/** The program the user is currently running, if any. */
export async function activeProgram(userId: number) {
  const [row] = await db
    .select({
      id: userPrograms.id,
      title: userPrograms.title,
      authorName: userPrograms.authorName,
      progression: userPrograms.progression,
      startedAt: userPrograms.startedAt,
      sourceProgramId: userPrograms.sourceProgramId,
    })
    .from(userPrograms)
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, "active")),
    )
    .orderBy(asc(userPrograms.startedAt))
    .limit(1);

  return row ?? null;
}
