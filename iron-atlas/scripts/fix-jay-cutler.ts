import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Jay Cutler's split from a real documented source
 * (liftosaur.com/programs/jay-cutler-split), which gives an exact
 * exercise-by-exercise breakdown. The previous version was a 6-day split
 * (Chest / Back / Shoulders / Legs-Quads / Arms / Hamstrings-Calves-Abs)
 * with entirely different exercise groupings; the real, documented split is
 * 5 days (Chest+Calves / Triceps+Biceps / Back / Delts+Traps / Legs) with a
 * genuinely different exercise list throughout.
 *
 * Hip Abductor and Hip Adductor machine work is in the source but has no
 * catalogue equivalent, so it's dropped rather than force-fit onto
 * something that isn't equivalent.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const DAYS: Day[] = [
  {
    name: "Chest & Calves",
    exercises: [
      { name: "Incline Dumbbell Press", sets: 3, reps: "8-12", notes: "Pyramid: reps descend as weight climbs across the 3 sets." },
      { name: "Dumbbell Bench Press", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "Incline Dumbbell Fly", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "Chest Dip", sets: 3, reps: "10" },
      { name: "Decline Barbell Bench Press", sets: 3, reps: "10" },
      { name: "Standing Calf Raise", sets: 3, reps: "12" },
      { name: "Seated Calf Raise", sets: 3, reps: "12" },
    ],
  },
  {
    name: "Triceps & Biceps",
    exercises: [
      { name: "Rope Pushdown", sets: 3, reps: "10-15", notes: "Pyramid." },
      { name: "Triceps Pushdown", sets: 3, reps: "10-15", notes: "Straight-bar attachment. Pyramid." },
      { name: "Close-Grip Bench Press", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "Bench Dip", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "EZ-Bar Skull Crusher", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "Overhead Cable Triceps Extension", sets: 3, reps: "8-12", notes: "Single-arm, reverse grip. Pyramid." },
      { name: "Barbell Curl", sets: 3, reps: "10-15", notes: "Pyramid." },
      { name: "Incline Dumbbell Curl", sets: 3, reps: "10-15", notes: "Pyramid." },
      { name: "Preacher Curl", sets: 3, reps: "10-15", notes: "Pyramid." },
      { name: "Hammer Curl", sets: 3, reps: "8-12", notes: "Pyramid." },
      { name: "Cable Curl", sets: 3, reps: "8-12", notes: "Lying. Pyramid." },
    ],
  },
  {
    name: "Back",
    exercises: [
      { name: "Wide-Grip Lat Pulldown", sets: 3, reps: "8", notes: "Underhand grip." },
      { name: "Wide-Grip Lat Pulldown", sets: 3, reps: "10", notes: "Standard overhand grip." },
      { name: "Conventional Deadlift", sets: 3, reps: "6" },
      { name: "T-Bar Row", sets: 3, reps: "8" },
      { name: "Dumbbell Row", sets: 3, reps: "10", notes: "One arm at a time." },
      { name: "Barbell Row", sets: 3, reps: "10", notes: "Bent-over." },
      { name: "Seated Cable Row", sets: 3, reps: "10" },
    ],
  },
  {
    name: "Delts & Traps",
    exercises: [
      { name: "Dumbbell Lateral Raise", sets: 3, reps: "10" },
      { name: "Seated Dumbbell Shoulder Press", sets: 3, reps: "8" },
      { name: "Machine Shoulder Press", sets: 3, reps: "10" },
      { name: "Reverse Pec Deck", sets: 3, reps: "10" },
      { name: "Barbell Shrug", sets: 3, reps: "10" },
      { name: "Upright Row", sets: 3, reps: "10" },
    ],
  },
  {
    name: "Quads, Hamstrings & Calves",
    exercises: [
      { name: "Leg Extension", sets: 2, reps: "12-15", notes: "Warm-up." },
      { name: "Back Squat", sets: 3, reps: "8" },
      { name: "Leg Press", sets: 3, reps: "10" },
      { name: "Walking Lunge", sets: 3, reps: "10" },
      { name: "Hack Squat", sets: 3, reps: "10" },
      { name: "Leg Extension", sets: 3, reps: "12" },
      { name: "Seated Leg Curl", sets: 3, reps: "10" },
      { name: "Lying Leg Curl", sets: 3, reps: "10" },
      { name: "Romanian Deadlift", sets: 3, reps: "8" },
      { name: "Single-Leg Romanian Deadlift", sets: 3, reps: "10" },
      { name: "Standing Calf Raise", sets: 3, reps: "12" },
      { name: "Seated Calf Raise", sets: 3, reps: "12" },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt from a real documented source (liftosaur.com/programs/jay-cutler-split) giving an exact exercise-by-exercise breakdown. The previous version of this entry was a 6-day split (Chest / Back / Shoulders / Legs / Arms / Hamstrings-Calves-Abs) with different exercise groupings throughout; the real, documented split is 5 days (Chest+Calves, Triceps+Biceps, Back, Delts+Traps, Legs), Thursday and Sunday off.

Hip Abductor and Hip Adductor machine work appears in the source's leg day but has no catalogue equivalent, so it's dropped rather than force-fit onto something that isn't equivalent.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "jay-cutler"));
  if (!program) throw new Error("jay-cutler not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 5,
        weeks: 12,
        splitType: "5-day split (Chest/Calves, Triceps/Biceps, Back, Delts/Traps, Legs)",
        summary: "Jay Cutler's mass-building split, transcribed from a real documented source: 5 training days a week, Thursday and Sunday off.",
        description: "Most exercises follow a pyramid scheme — weight climbs and reps descend across 3 sets. Chest and calves share a day, as do triceps and biceps; back, shoulders/traps, and a comprehensive leg day each get their own session.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://www.liftosaur.com/programs/jay-cutler-split"],
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
