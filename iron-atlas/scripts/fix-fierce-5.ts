import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Fierce 5 from the real, freely-published source
 * (liftvault.com/programs/bodybuilding/fierce-5-beginner-bodybuilding-program-spreadsheet/,
 * itself citing the original forum post) and fixes a real author
 * misattribution: Fierce 5 was created by a Bodybuilding.com forum user
 * (handle "davisj3537"), not Jason Blaha — those are two different
 * beginner 5x5-style programs that got conflated. Jason Blaha's own
 * program is Ice Cream Fitness 5x5, already a separate entry in this
 * library.
 *
 * The previous version also had no accessory work at all and included a
 * conventional deadlift — the real source is explicit that Fierce 5 has
 * NO conventional deadlift (Romanian deadlift covers the posterior chain
 * instead, chosen specifically for being easier for a beginner to recover
 * from while squatting three times a week). Accessory work (face pulls,
 * rows, arm work, abs) is the whole reason this program exists as
 * something distinct from a bare 5x5 — the old version, lacking it, was
 * indistinguishable from any other novice 5x5 program.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const DAYS: Day[] = [
  {
    name: "Workout A",
    exercises: [
      { name: "Back Squat", sets: 3, reps: "5" },
      { name: "Barbell Bench Press", sets: 3, reps: "5" },
      { name: "Pendlay Row", sets: 3, reps: "8" },
      { name: "Face Pull", sets: 3, reps: "10" },
      { name: "Standing Calf Raise", sets: 2, reps: "15" },
      { name: "Triceps Pushdown", sets: 2, reps: "10" },
    ],
  },
  {
    name: "Workout B",
    exercises: [
      { name: "Front Squat", sets: 3, reps: "5" },
      { name: "Overhead Press", sets: 3, reps: "5" },
      { name: "Romanian Deadlift", sets: 3, reps: "8", notes: "Fierce 5 deliberately has no conventional deadlift — RDL covers the posterior chain with less fatigue for a beginner squatting 3x/week." },
      { name: "Lat Pulldown", sets: 3, reps: "8" },
      { name: "Sit-Up", sets: 2, reps: "15", notes: "Source says \"abdominals\" generically." },
      { name: "Barbell Curl", sets: 2, reps: "10" },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt from the real, freely-published source (liftvault.com, citing the original Bodybuilding.com forum post). Two real problems fixed:

1. Author misattribution: this entry credited Jason Blaha, but Fierce 5 was actually created by a Bodybuilding.com forum user (handle "davisj3537") around 2014 — not a famous coach. Jason Blaha's own program is the separate Ice Cream Fitness 5x5 entry in this library; the two got conflated.

2. Missing accessories and a deadlift that shouldn't be there: the previous version had no accessory work at all (just 3 bare compound lifts per day) and included a conventional deadlift. The real program is explicit that it has NO conventional deadlift — Romanian deadlift covers the posterior chain instead, specifically chosen to be easier to recover from for a beginner squatting three times a week. Accessory work (face pulls, rows, calf/tricep/bicep/ab work) is the entire reason this program is distinct from a bare 5x5 — without it, the old version was indistinguishable from any other novice program.

The source also mentions Upper/Lower (4-day) and dumbbell-only variants of Fierce 5; this entry models the original 3-day full-body version, which the source calls "the standard starting point."`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "fierce-5"));
  if (!program) throw new Error("fierce-5 not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        authorName: "davisj3537 (Bodybuilding.com forums)",
        daysPerWeek: 3,
        weeks: 12,
        splitType: "full body A/B alternating (no conventional deadlift — RDL instead)",
        summary: "A beginner full-body 5x5-style program built by a Bodybuilding.com forum poster, distinct from bare 5x5 routines by its deliberate accessory work (rows, face pulls, arms, abs) and its choice of Romanian deadlift over conventional deadlift.",
        description: "3 non-consecutive days a week, alternating Workout A (squat, bench, Pendlay row) and Workout B (front squat, overhead press, Romanian deadlift), each followed by a handful of accessories on double progression (add reps, then weight). Week 1 runs A/B/A, week 2 runs B/A/B, and so on. There's no conventional deadlift in Fierce 5 by design — the Romanian deadlift trains the posterior chain with less fatigue, which suits squatting three times a week as a beginner.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://liftvault.com/programs/bodybuilding/fierce-5-beginner-bodybuilding-program-spreadsheet/"],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, repeatCount: 12 })
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
