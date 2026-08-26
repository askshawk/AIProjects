import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";

/**
 * Loads a library program and its whole training block. Shared by the detail
 * page and the spreadsheet export so the two can never drift apart.
 *
 * Explicit columns throughout: `select *` on `programs` would drag the
 * 384-float embedding into every caller, and nothing here uses it.
 */
export async function loadProgram(slug: string) {
  const [program] = await db
    .select({
      id: programs.id,
      slug: programs.slug,
      title: programs.title,
      authorName: programs.authorName,
      summary: programs.summary,
      description: programs.description,
      goal: programs.goal,
      experienceLevel: programs.experienceLevel,
      daysPerWeek: programs.daysPerWeek,
      weeks: programs.weeks,
      splitType: programs.splitType,
      progression: programs.progression,
      equipmentRequired: programs.equipmentRequired,
      tags: programs.tags,
      sourceUrls: programs.sourceUrls,
      aiGenerated: programs.aiGenerated,
      verified: programs.verified,
      confidence: programs.confidence,
      confidenceNotes: programs.confidenceNotes,
    })
    .from(programs)
    .where(eq(programs.slug, slug));

  if (!program) return null;

  // One query for the whole block; grouped in memory rather than N+1 per day.
  const rows = await db
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
      order: programExercises.order,
      sets: programExercises.sets,
      reps: programExercises.reps,
      intensityType: programExercises.intensityType,
      intensityValue: programExercises.intensityValue,
      restSeconds: programExercises.restSeconds,
      tempo: programExercises.tempo,
      exNotes: programExercises.notes,
      supersetGroup: programExercises.supersetGroup,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      primaryMuscle: exercises.primaryMuscle,
      equipment: exercises.equipment,
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

  return { program, rows };
}

export type ProgramRow = NonNullable<
  Awaited<ReturnType<typeof loadProgram>>
>["rows"][number];
export type ProgramMeta = NonNullable<
  Awaited<ReturnType<typeof loadProgram>>
>["program"];

/** Groups the flat join into weeks → days → exercises, preserving query order. */
export function groupByWeek(rows: ProgramRow[]) {
  const weeks = new Map<
    number,
    {
      meta: ProgramRow;
      days: Map<number, { meta: ProgramRow; items: ProgramRow[] }>;
    }
  >();
  for (const row of rows) {
    const week = weeks.get(row.weekId) ?? { meta: row, days: new Map() };
    const day = week.days.get(row.dayId) ?? { meta: row, items: [] };
    day.items.push(row);
    week.days.set(row.dayId, day);
    weeks.set(row.weekId, week);
  }
  return weeks;
}

/**
 * Rewrites a program's rows to use the gym's substitutions. Applied before
 * rendering *and* before export, so the spreadsheet you download is the
 * program you were shown — the two can't drift.
 */
export function applySwaps(
  rows: ProgramRow[],
  swaps: Map<
    number,
    { to: { id: number; name: string; equipment: string } | null }
  >,
): ProgramRow[] {
  return rows.map((row) => {
    const swap = swaps.get(row.exerciseId);
    if (!swap?.to) return row;
    return {
      ...row,
      exerciseId: swap.to.id,
      exerciseName: swap.to.name,
      equipment: swap.to.equipment as ProgramRow["equipment"],
      // Keep the original visible; a swapped program should say what it swapped.
      exNotes: [row.exNotes, `Swapped from ${row.exerciseName}`]
        .filter(Boolean)
        .join(" · "),
    };
  });
}
