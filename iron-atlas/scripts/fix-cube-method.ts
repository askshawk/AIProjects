import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds The Cube Method to actually implement its defining mechanic:
 * squat/bench/deadlift each rotate through Heavy/Explosive/Repetition
 * treatment across a 4-week cycle (confirmed via barbend.com/
 * brandon-lilly-cube-method-program). The previous version fixed bench to
 * both "Heavy" AND "Speed" every week while squat/deadlift alternated
 * Heavy/Rep between only two weeks -- there was no real rotation, which is
 * the entire point the program is named for ("cube" = each lift rotating
 * through a different face/stress each week).
 *
 * Confirmed real percentages: Heavy 80-90%+, Explosive ~60%, Repetition
 * 70-80%. A 4th "bodybuilding" day (3-4 accessory movements, near failure)
 * runs every week regardless of the rotation.
 */

type Ex = { name: string; sets: number; reps: string; intensityValue?: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const HEAVY = (lift: string, sets: number, reps: string): Ex => ({ name: lift, sets, reps, intensityValue: "85", notes: "Heavy day: treat each rep like a competitive attempt." });
const EXPLOSIVE = (lift: string, sets: number, reps: string): Ex => ({ name: lift, sets, reps, intensityValue: "60", notes: "Explosive day: accelerate the bar without losing position." });
const REP = (lift: string, sets: number, reps: string): Ex => ({ name: lift, sets, reps, intensityValue: "75", notes: "Repetition day: build volume and reinforce technique." });

const ACCESSORY: Ex[] = [
  { name: "Close-Grip Bench Press", sets: 3, reps: "8" },
  { name: "Barbell Row", sets: 3, reps: "8" },
  { name: "Dumbbell Lateral Raise", sets: 3, reps: "12" },
  { name: "Hanging Leg Raise", sets: 3, reps: "15" },
];

const WEEKS: Day[][] = [
  // Week 1: Squat Heavy, Bench Explosive, Deadlift Rep
  [
    { name: "Squat - Heavy", exercises: [HEAVY("Back Squat", 5, "3")] },
    { name: "Bench - Explosive", exercises: [EXPLOSIVE("Barbell Bench Press", 8, "3")] },
    { name: "Deadlift - Repetition", exercises: [REP("Conventional Deadlift", 5, "5")] },
    { name: "Bodybuilding", exercises: ACCESSORY },
  ],
  // Week 2: Squat Explosive, Bench Repetition, Deadlift Heavy
  [
    { name: "Squat - Explosive", exercises: [EXPLOSIVE("Back Squat", 8, "3")] },
    { name: "Bench - Repetition", exercises: [REP("Barbell Bench Press", 5, "5")] },
    { name: "Deadlift - Heavy", exercises: [HEAVY("Conventional Deadlift", 5, "3")] },
    { name: "Bodybuilding", exercises: ACCESSORY },
  ],
  // Week 3: Squat Repetition, Bench Heavy, Deadlift Explosive
  [
    { name: "Squat - Repetition", exercises: [REP("Back Squat", 5, "5")] },
    { name: "Bench - Heavy", exercises: [HEAVY("Barbell Bench Press", 5, "3")] },
    { name: "Deadlift - Explosive", exercises: [EXPLOSIVE("Conventional Deadlift", 8, "3")] },
    { name: "Bodybuilding", exercises: ACCESSORY },
  ],
  // Week 4: restart the rotation at a new (higher) training max — the
  // source doesn't give exact new numbers, so this reuses week 1's
  // relative percentages rather than inventing a specific jump.
  [
    { name: "Squat - Heavy (new max)", exercises: [HEAVY("Back Squat", 5, "3")] },
    { name: "Bench - Explosive (new max)", exercises: [EXPLOSIVE("Barbell Bench Press", 8, "3")] },
    { name: "Deadlift - Repetition (new max)", exercises: [REP("Conventional Deadlift", 5, "5")] },
    { name: "Bodybuilding", exercises: ACCESSORY },
  ],
];

const CONFIDENCE_NOTES = `Rebuilt to implement the mechanic the program is actually named for. Confirmed via barbend.com/brandon-lilly-cube-method-program: squat, bench, and deadlift each rotate through Heavy (80-90%+), Explosive (~60%), and Repetition (70-80%) treatment across a 4-week cycle — each lift gets a different one of the three each week, which is what "cube" refers to. A 4th bodybuilding day (3-4 accessory movements, near failure) runs every week regardless of rotation. The previous version fixed bench to both Heavy and Speed every single week with no real rotation at all, missing the program's entire point.

Week 4 restarts the rotation at a new, higher training max rather than introducing a new lift-to-treatment assignment — the source doesn't give exact new numbers for that restart, so week 4 here reuses week 1's relative percentages rather than inventing a specific jump. This is one full mesocycle (4 weeks); the source frames the program as repeating this mesocycle indefinitely at increasing training maxes, not as a fixed longer block. Exact accessory exercise selection for the bodybuilding day isn't specified precisely in the source ("3-4 movements... with some high-quality sets to near failure") — the accessories here are a reasonable, not verbatim, selection.`;

async function resolveAll(weeks: Day[][]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const week of weeks) for (const day of week) for (const ex of day.exercises) names.add(ex.name);
  const ids = new Map<string, number>();
  for (const name of names) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  return ids;
}

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "cube-method"));
  if (!program) throw new Error("cube-method not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(WEEKS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 4,
        weeks: 4,
        splitType: "squat/bench/deadlift rotating Heavy/Explosive/Repetition across a 4-week cycle, plus a bodybuilding day",
        summary: "Brandon Lilly's Cube Method: squat, bench, and deadlift each rotate through Heavy, Explosive, and Repetition treatment week to week, so no lift repeats the same stress two weeks running.",
        description: "Each week, squat/bench/deadlift are each assigned one of three treatments — Heavy (80-90%+, near-competition intensity), Explosive (~60%, bar speed), or Repetition (70-80%, volume and technique) — and which lift gets which rotates every week. After 3 weeks every lift has had each treatment once; week 4 restarts the rotation at a new, higher training max. A 4th day each week is dedicated to bodybuilding-style accessory work for weak points, kept to a handful of movements taken close to failure.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://barbend.com/brandon-lilly-cube-method-program/"],
      })
      .where(eq(programs.id, program.id));

    for (const [weekIndex, week] of WEEKS.entries()) {
      const [savedWeek] = await tx
        .insert(programWeeks)
        .values({ programId: program.id, weekNumber: weekIndex + 1, repeatCount: 1 })
        .returning({ id: programWeeks.id });

      for (const [dayIndex, day] of week.entries()) {
        const [savedDay] = await tx
          .insert(programDays)
          .values({ weekId: savedWeek.id, dayIndex, name: day.name })
          .returning({ id: programDays.id });

        for (const [order, ex] of day.exercises.entries()) {
          await tx.insert(programExercises).values({
            dayId: savedDay.id,
            exerciseId: ids.get(ex.name)!,
            order,
            sets: ex.sets,
            reps: ex.reps,
            intensityType: ex.intensityValue ? "percent_1rm" : "none",
            intensityValue: ex.intensityValue ?? null,
            notes: ex.notes ?? null,
          });
        }
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
