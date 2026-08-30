import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Fixes WS4SB's 4-day structure. Confirmed via multiple sources (Lift
 * Vault, 9to5strength, the Starting Strength wiki mirror): the real 4-day
 * version (Part 3) is Max-Effort Upper (Mon), Dynamic-Effort Lower (Tue),
 * Repetition-Effort Upper (Thu), Max-Effort Lower (Fri) — two upper days,
 * but the two lower days are ME and DE, not ME and RE. The previous
 * version had ME-Lower and RE-Lower, missing the dynamic-effort/speed
 * component (box jumps, speed squats/deadlifts) entirely and duplicating
 * the repetition-effort emphasis onto the lower body instead.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const DAYS: Day[] = [
  {
    name: "Max Effort Upper (Bench Press)",
    exercises: [
      { name: "Close-Grip Bench Press", sets: 5, reps: "1-3" },
      { name: "Incline Dumbbell Press", sets: 4, reps: "8-12" },
      { name: "Triceps Pushdown", sets: 3, reps: "10-12" },
      { name: "Barbell Row", sets: 4, reps: "8-12" },
      { name: "Dumbbell Curl", sets: 3, reps: "10-12" },
    ],
  },
  {
    name: "Dynamic Effort Lower (Squat/Deadlift)",
    exercises: [
      { name: "Box Jump", sets: 6, reps: "3", notes: "Speed/plyometric work opening the session." },
      { name: "Box Squat", sets: 8, reps: "3", notes: "Speed squats — light load, maximum bar speed." },
      { name: "Back Extension", sets: 4, reps: "12-15" },
      { name: "Glute Ham Raise", sets: 4, reps: "8-12" },
      { name: "Hanging Leg Raise", sets: 4, reps: "15" },
    ],
  },
  {
    name: "Repetition Effort Upper (Bench Press)",
    exercises: [
      { name: "Dumbbell Bench Press", sets: 4, reps: "10-12" },
      { name: "Standing Dumbbell Shoulder Press", sets: 4, reps: "10" },
      { name: "Face Pull", sets: 3, reps: "15" },
      { name: "Dumbbell Skull Crusher", sets: 3, reps: "12" },
      { name: "Lat Pulldown", sets: 4, reps: "10" },
      { name: "Barbell Curl", sets: 3, reps: "10" },
      { name: "Wrist Curl", sets: 3, reps: "15" },
    ],
  },
  {
    name: "Max Effort Lower (Squat/Deadlift)",
    exercises: [
      { name: "Box Squat", sets: 5, reps: "1-3" },
      { name: "Leg Press", sets: 4, reps: "10-12" },
      { name: "Back Extension", sets: 4, reps: "12-15" },
      { name: "Glute Ham Raise", sets: 4, reps: "8-12" },
      { name: "Hanging Leg Raise", sets: 4, reps: "15" },
    ],
  },
];

const CONFIDENCE_NOTES = `Confirmed via multiple sources (Lift Vault, 9to5strength, a Starting Strength wiki mirror): the real 4-day WS4SB (Part 3) runs Max-Effort Upper (Monday), Dynamic-Effort Lower (Tuesday), Repetition-Effort Upper (Thursday), Max-Effort Lower (Friday). The previous version of this entry had ME-Lower and RE-Lower — missing the dynamic-effort/speed component (box jumps, speed box squats) entirely and duplicating repetition-effort-style accessory volume onto the lower body instead of the real speed work. Fixed the Tuesday session to be genuine dynamic-effort work; the other three days are unchanged since nothing found contradicts them.

DeFranco describes this as "a loose template, not a strict percentage-of-1RM plan" where exercises rotate every few weeks — the specific exercise selection here is a reasonable single-cycle snapshot, not a claim that these exact movements run unchanged indefinitely.`;

async function resolveAll(days: Day[]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const day of days) for (const ex of day.exercises) names.add(ex.name);
  const ids = new Map<string, number>();
  for (const name of names) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  return ids;
}

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "westside-skinny-bastards"));
  if (!program) throw new Error("westside-skinny-bastards not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        splitType: "conjugate (Max Effort Upper/Lower + Dynamic Effort Lower + Repetition Effort Upper)",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://liftvault.com/programs/strength/westside-for-skinny-bastards-spreadsheet/"],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, repeatCount: 4 })
      .returning({ id: programWeeks.id });

    for (const [dayIndex, day] of DAYS.entries()) {
      const [savedDay] = await tx
        .insert(programDays)
        .values({ weekId: week.id, dayIndex, name: day.name })
        .returning({ id: programDays.id });

      for (const [order, ex] of day.exercises.entries()) {
        await tx.insert(programExercises).values({
          dayId: savedDay.id,
          exerciseId: ids.get(ex.name)!,
          order,
          sets: ex.sets,
          reps: ex.reps,
          intensityType: "none",
          notes: ex.notes ?? null,
        });
      }
    }
  });

  const usedIds = await db
    .selectDistinct({ exerciseId: programExercises.exerciseId })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.dayId))
    .innerJoin(programWeeks, eq(programWeeks.id, programDays.weekId))
    .where(eq(programWeeks.programId, program.id));
  const equipRows = await db
    .select({ equipment: exercises.equipment })
    .from(exercises)
    .where(inArray(exercises.id, usedIds.map((r) => r.exerciseId)));
  const equipmentRequired = [...new Set(equipRows.map((r) => r.equipment))];
  await db.update(programs).set({ equipmentRequired }).where(eq(programs.id, program.id));

  console.log("done. equipment:", equipmentRequired);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
