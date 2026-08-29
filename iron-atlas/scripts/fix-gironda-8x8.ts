import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Vince Gironda's 8x8 from the real, documented 4-day split
 * version (muscleandstrength.com/articles/gironda-8x8-system-mass-leanness).
 * The real source actually documents TWO versions -- a 3-day full-body
 * option (all 9 exercises in one session) and a 4-day split -- and the
 * previous stored version matched neither: it repeated a 3-way A/B/C split
 * twice per week (6 sessions), with exercises (Barbell Bench Press, Chin-Up,
 * Behind-the-Neck Press, Front Squat, EZ-Bar Skull Crusher...) that don't
 * appear in the real source's exercise list for either documented version at
 * all. Using the 4-day split here since it's the version most people
 * actually run and matches this app's typical program shape.
 *
 * Two source-specific substitutions with no exact catalogue equivalent:
 * "Zottman Curl" (curl up, pronate, reverse-curl down) -> Hammer Curl, the
 * closest available bicep/forearm-emphasis curl variant. "Kneeling Overhead
 * Triceps Extension" -> Overhead Cable Triceps Extension.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const DAYS: Day[] = [
  {
    name: "Back & Triceps",
    exercises: [
      { name: "Pull-Up", sets: 8, reps: "8" },
      { name: "Seated Cable Row", sets: 8, reps: "8" },
      { name: "Dumbbell Pullover", sets: 8, reps: "8", notes: "Source specifies a cable pullover; the catalogue's closest equivalent is used." },
      { name: "Chest Dip", sets: 8, reps: "8", notes: "Source: narrow-grip dips." },
      { name: "Overhead Cable Triceps Extension", sets: 8, reps: "8", notes: "Source: \"kneeling overhead extensions.\"" },
    ],
  },
  {
    name: "Legs",
    exercises: [
      { name: "Hack Squat", sets: 8, reps: "8" },
      { name: "Leg Press", sets: 8, reps: "8", notes: "Source specifies wide-stance or single-leg leg press." },
      { name: "Stiff-Leg Deadlift", sets: 8, reps: "8" },
    ],
  },
  {
    name: "Calves & Shoulders",
    exercises: [
      { name: "Seated Barbell Overhead Press", sets: 8, reps: "8", notes: "Source: military press." },
      { name: "Leaning Cable Lateral Raise", sets: 8, reps: "8" },
      { name: "Donkey Calf Raise", sets: 8, reps: "20" },
    ],
  },
  {
    name: "Chest & Biceps",
    exercises: [
      { name: "Cable Fly", sets: 8, reps: "8", notes: "Source: floor flyes with cables." },
      { name: "Weighted Chest Dip", sets: 8, reps: "8", notes: "Source: \"V-dips.\"" },
      { name: "Incline Dumbbell Press", sets: 8, reps: "8" },
      { name: "Hammer Curl", sets: 8, reps: "8", notes: "Source: \"Zottman curls\" — closest catalogue equivalent." },
      { name: "Drag Curl", sets: 8, reps: "8" },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt from the real, documented 4-day-split version of Vince Gironda's 8x8 system (muscleandstrength.com/articles/gironda-8x8-system-mass-leanness). The source actually documents two versions — a 3-day full-body option (all 9 exercises in one session, 3x/week) and this 4-day split — and the previous version of this entry matched neither: it repeated a 3-way A/B/C split twice weekly with an exercise list (Barbell Bench Press, Chin-Up, Behind-the-Neck Press, Front Squat, EZ-Bar Skull Crusher, Preacher Curl) that doesn't appear in the real source's exercise list for either documented version at all.

The 4-day split is used here as the more commonly-run version. Two substitutions with no exact catalogue equivalent: "Zottman Curl" is mapped to Hammer Curl (closest bicep/forearm-emphasis curl variant), and "kneeling overhead extensions" is mapped to Overhead Cable Triceps Extension.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "gironda-8x8"));
  if (!program) throw new Error("gironda-8x8 not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 4,
        weeks: 6,
        splitType: "4-day split (Back/Triceps, Legs, Calves/Shoulders, Chest/Biceps), 8 sets x 8 reps per exercise",
        summary: "Vince Gironda's 8x8 'Honest Workout': every exercise done for 8 sets of 8 reps with the same weight and short rest, across a 4-day split.",
        description: "Every exercise in every session is 8 sets of 8 reps with a single weight chosen so 9-12 reps would be possible fresh — the point is accumulated fatigue across the 8 sets, not weight increases within a set. Rest is brief: about a minute for legs/back/chest, 30 seconds for arms/shoulders/calves. The source also documents a 3-day full-body option (all exercises in one session, 3x/week) as an alternative to this 4-day split.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://www.muscleandstrength.com/articles/gironda-8x8-system-mass-leanness"],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, repeatCount: 6 })
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
