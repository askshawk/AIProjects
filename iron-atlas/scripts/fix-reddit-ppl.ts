import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Fixes the Metallicadpa Reddit PPL's defining mechanic, confirmed via
 * liftvault.com/programs/strength/metallicadpa-ppl-template/: main
 * compound lifts use a "5/5+" structure — five straight sets of 5, then a
 * sixth all-out AMRAP set — which drives the program's session-to-session
 * linear progression (hit the AMRAP target, the load goes up next time).
 * The stored version had every main lift at a flat "3x4-6", missing this
 * entirely. Accessory exercise selection is unchanged — nothing found
 * contradicts it.
 *
 * The real program also runs indefinitely (the spreadsheet tracks progress
 * in 12-week windows but the program itself has no fixed end), not the
 * previously-stored fixed 8 weeks.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const MAIN = (name: string): Ex[] => [
  { name, sets: 5, reps: "5", notes: "5/5+ structure: 5 straight sets of 5..." },
  { name, sets: 1, reps: "5+", notes: "...then this AMRAP set. Hitting the target reps advances the load next session — the program's whole progression mechanic." },
];

const DAYS: Day[] = [
  {
    name: "Push A",
    exercises: [
      { name: "Cable Lateral Raise", sets: 3, reps: "12-15" },
      ...MAIN("Barbell Bench Press"),
      { name: "Incline Dumbbell Press", sets: 3, reps: "8-12" },
      { name: "Seated Dumbbell Shoulder Press", sets: 3, reps: "6-10" },
      { name: "Triceps Pushdown", sets: 3, reps: "12-15" },
      { name: "Dumbbell Overhead Triceps Extension", sets: 3, reps: "12-15" },
    ],
  },
  {
    name: "Pull A",
    exercises: [
      ...MAIN("Conventional Deadlift"),
      { name: "Face Pull", sets: 3, reps: "12-15" },
      { name: "Pull-Up", sets: 3, reps: "6-10" },
      { name: "Barbell Row", sets: 3, reps: "8-12" },
      { name: "Barbell Curl", sets: 3, reps: "8-12" },
      { name: "Hammer Curl", sets: 3, reps: "12-15" },
    ],
  },
  {
    name: "Legs A",
    exercises: [
      ...MAIN("Back Squat"),
      { name: "Leg Press", sets: 3, reps: "8-12" },
      { name: "Lying Leg Curl", sets: 3, reps: "8-12" },
      { name: "Leg Extension", sets: 3, reps: "12-15" },
      { name: "Standing Calf Raise", sets: 3, reps: "8-12" },
      { name: "Seated Calf Raise", sets: 3, reps: "12-15" },
    ],
  },
  {
    name: "Push B",
    exercises: [
      { name: "Cable Lateral Raise", sets: 3, reps: "12-15" },
      { name: "Dumbbell Bench Press", sets: 3, reps: "6-10" },
      { name: "Incline Barbell Bench Press", sets: 3, reps: "8-12" },
      { name: "Chest Dip", sets: 3, reps: "8-12" },
      ...MAIN("Overhead Press"),
      { name: "Dumbbell Overhead Triceps Extension", sets: 3, reps: "12-15" },
    ],
  },
  {
    name: "Pull B",
    exercises: [
      { name: "Face Pull", sets: 3, reps: "12-15" },
      { name: "Weighted Pull-Up", sets: 3, reps: "4-6" },
      { name: "T-Bar Row", sets: 3, reps: "8-12" },
      { name: "Seated Cable Row", sets: 3, reps: "6-10" },
      { name: "EZ-Bar Curl", sets: 3, reps: "8-12" },
      { name: "Concentration Curl", sets: 3, reps: "12-15" },
    ],
  },
  {
    name: "Legs B",
    exercises: [
      ...MAIN("Front Squat"),
      { name: "Leg Press", sets: 3, reps: "8-12" },
      { name: "Walking Lunge", sets: 3, reps: "12-15" },
      { name: "Lying Leg Curl", sets: 3, reps: "8-12" },
      { name: "Standing Calf Raise", sets: 3, reps: "8-12" },
      { name: "Seated Calf Raise", sets: 3, reps: "12-15" },
    ],
  },
];

const CONFIDENCE_NOTES = `Confirmed via liftvault.com/programs/strength/metallicadpa-ppl-template/: the program's defining mechanic is a "5/5+" structure on every main compound lift — five straight sets of 5, then a sixth all-out AMRAP set. Hitting the AMRAP target advances the load for that lift next session; that's the entire progression system (upper body +2.5kg, lower body +5kg per successful session). The stored version had every main lift at a flat 3x4-6 with no AMRAP set, missing the mechanic the whole program runs on.

The source also describes this as running indefinitely with session-to-session linear progression until fatigue forces a reset, not a fixed short block — the spreadsheet tracks progress in 12-week windows, which is used here as a representative length rather than a true fixed endpoint. Accessory exercise selection is unchanged from the previous version; nothing found contradicts it.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "reddit-ppl"));
  if (!program) throw new Error("reddit-ppl not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        weeks: 12,
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://liftvault.com/programs/strength/metallicadpa-ppl-template/"],
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
