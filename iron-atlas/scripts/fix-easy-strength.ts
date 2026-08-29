import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Fixes Easy Strength: the stored version split the program's own explicit
 * instruction into rotating pairs of lifts across 5 different sessions
 * (squat/bench, deadlift/pull-up, squat/press...), which is the opposite of
 * what the program actually says.
 *
 * Pavel Tsatsouline's instruction to Dan John, which the whole program is
 * built around, is unambiguous: "pick five lifts. Do them every workout."
 * All five, every session, for 40 workouts, never approaching failure. Five
 * lifts split across five different days is a different program.
 */

const LIFTS = ["Front Squat", "Barbell Bench Press", "Conventional Deadlift", "Weighted Pull-Up", "Overhead Press"];

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "easy-strength"));
  if (!program) throw new Error("easy-strength not found");

  const ids = new Map<string, number>();
  for (const name of LIFTS) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 5,
        weeks: 8,
        splitType: "full body, all 5 chosen lifts every session",
        summary:
          "Dan John's 40-workout program built on Pavel Tsatsouline's dare: pick five lifts, do all five every session, never approach failure.",
        description:
          "Pavel's original instruction to Dan John: \"pick five lifts. Do them every workout. Never miss a rep... never go over ten reps for any of the movements.\" All five lifts appear in every one of the 40 sessions — the point is frequent, low-fatigue practice of the same movements, not a split. Weight stays deliberately conservative throughout; the program's value is in the sheer repetition, not in approaching a limit.",
        confidence: "documented",
        confidenceNotes:
          "The core instruction (five lifts, every session, sets of low reps, 40 total workouts) is well documented directly from Dan John's own writing and a StrongFirst community discussion of the program. The specific five lifts used here (front squat, bench press, deadlift, weighted pull-up, overhead press) are a common published selection but not the only one — Dan John explicitly leaves lift selection to the individual.",
        verified: false,
        sourceUrls: [
          "https://www.strongfirst.com/community/threads/anyone-do-dan-johns-easy-strength.25430/",
          "https://medium.com/@danjohn84123/even-easier-strength-d7fc672eb9d",
        ],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, repeatCount: 8 })
      .returning({ id: programWeeks.id });

    for (const [dayIndex, dayName] of ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5"].entries()) {
      const [day] = await tx
        .insert(programDays)
        .values({ weekId: week.id, dayIndex, name: dayName })
        .returning({ id: programDays.id });

      for (const [order, name] of LIFTS.entries()) {
        await tx.insert(programExercises).values({
          dayId: day.id,
          exerciseId: ids.get(name)!,
          order,
          sets: 2,
          reps: "5",
          intensityType: "none",
          notes:
            order === 0
              ? "Stay well short of failure — this is practice, not a max effort."
              : null,
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
  await db
    .update(programs)
    .set({ equipmentRequired: [...new Set(equipRows.map((r) => r.equipment))] })
    .where(eq(programs.id, program.id));

  console.log("done");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
