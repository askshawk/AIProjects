import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds PH3. The stored version was a bodybuilding-style Push/Pull/Legs
 * split at 6 days/week — a different program entirely. The real PH3 is a
 * squat/bench/deadlift-centered powerbuilding program: 5 training days across
 * a 7-day week (2 rest days), 13 weeks split into four phases (accumulation,
 * transition, intensity/overreaching, taper).
 *
 * Sourced from a detailed JeFit tracker page listing 23 real, distinct
 * training days with exact exercises/sets/reps, plus independent structural
 * confirmation (day-by-day movement pattern, phase breakdown) from a second
 * review site. Modeled here as the confirmed Week 1 (accumulation phase) —
 * rebuilding all 23 documented days individually was out of scope for a
 * whole-library pass, so this is the real Week 1 template, not a synthesis.
 * A handful of unusual accessory movements (stability-ball drills, Turkish
 * get-ups, wood choppers) aren't in the exercise catalogue and are noted as
 * dropped rather than force-fit onto something that isn't equivalent.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const WEEK_1: Day[] = [
  {
    name: "Squat, Bench, Deadlift",
    exercises: [
      { name: "Back Squat", sets: 3, reps: "9", notes: "72.5% of training max." },
      { name: "Barbell Bench Press", sets: 3, reps: "9", notes: "72.5% of training max." },
      { name: "Conventional Deadlift", sets: 3, reps: "7", notes: "72.5% of training max." },
      { name: "Seated Cable Row", sets: 6, reps: "10" },
      { name: "Dumbbell Lateral Raise", sets: 3, reps: "20" },
      { name: "Cable Crunch", sets: 4, reps: "20" },
    ],
  },
  {
    name: "Upper Body Hypertrophy",
    exercises: [
      { name: "Wide-Grip Lat Pulldown", sets: 3, reps: "8" },
      { name: "Dumbbell Bench Press", sets: 3, reps: "8" },
      { name: "Dumbbell Curl", sets: 5, reps: "8" },
      { name: "Triceps Pushdown", sets: 5, reps: "8" },
      { name: "T-Bar Row", sets: 3, reps: "8" },
      { name: "Overhead Press", sets: 3, reps: "8", notes: "Barbell, standing." },
      { name: "Machine Preacher Curl", sets: 4, reps: "10-20", notes: "Descending-weight cluster: 20/10/10/10." },
    ],
  },
  {
    name: "Squat, Bench, Lower Body",
    exercises: [
      { name: "Back Squat", sets: 3, reps: "7" },
      { name: "Stiff-Leg Deadlift", sets: 3, reps: "10", notes: "Banded, per source." },
      { name: "Incline Barbell Bench Press", sets: 3, reps: "7" },
      { name: "Leg Extension", sets: 3, reps: "10" },
      { name: "Lying Leg Curl", sets: 3, reps: "10" },
      { name: "Standing Calf Raise", sets: 4, reps: "8" },
      { name: "Hanging Leg Raise", sets: 4, reps: "20" },
    ],
  },
  {
    name: "Deadlift, Bench, Upper Body",
    exercises: [
      { name: "Conventional Deadlift", sets: 5, reps: "5" },
      { name: "Dumbbell Lateral Raise", sets: 5, reps: "20" },
      { name: "Barbell Bench Press", sets: 3, reps: "5" },
      { name: "Sumo Deadlift", sets: 3, reps: "5" },
      { name: "Wide-Grip Lat Pulldown", sets: 3, reps: "15" },
      { name: "Barbell Row", sets: 3, reps: "15", notes: "Bent-over." },
      { name: "Machine Preacher Curl", sets: 4, reps: "15-30", notes: "Descending-weight cluster: 30/15/15/15." },
    ],
  },
  {
    name: "Squat, Lower Body",
    exercises: [
      { name: "Hack Squat", sets: 5, reps: "5" },
      { name: "Back Squat", sets: 5, reps: "5" },
      { name: "Leg Extension", sets: 4, reps: "15-30", notes: "Descending-weight cluster: 30/15/15/15." },
      { name: "Lying Leg Curl", sets: 4, reps: "15-30", notes: "Descending-weight cluster: 30/15/15/15." },
      { name: "Standing Calf Raise", sets: 3, reps: "15" },
      { name: "Walking Lunge", sets: 3, reps: "15", notes: "Dumbbell." },
      { name: "Cable Crunch", sets: 4, reps: "20" },
    ],
  },
];

const CONFIDENCE_NOTES = `The previous version of this program was a bodybuilding-style Push/Pull/Legs split — a completely different program. The real PH3 is a squat/bench/deadlift powerbuilding program: 5 training days across a 7-day week (2 rest days), 13 weeks divided into accumulation (weeks 1-4), transition (5-8), intensity/overreaching (9-12), and a taper/test week (13).

What's rebuilt here is the real, sourced Week 1 (accumulation phase) — a detailed tracker page lists 23 distinct real training days across the full program with exact exercises, sets, and reps; reconstructing every one of those was out of scope for a pass covering the whole library, so this models the confirmed Week 1 template, not a synthesis of the later weeks. A few unusual accessory movements from the source (stability-ball drills, Turkish get-ups, a dumbbell wood-chopper) aren't in this app's exercise catalogue and were dropped rather than mapped onto something that isn't really equivalent.

Weeks 2-13 should be understood as following the same 5-day structure with progressively changing percentages and rep schemes per the phase breakdown above, not as verified session-by-session content.`;

async function resolveAll(days: Day[]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const d of days) for (const ex of d.exercises) names.add(ex.name);
  const ids = new Map<string, number>();
  for (const name of names) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  return ids;
}

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "layne-norton-ph3"));
  if (!program) throw new Error("layne-norton-ph3 not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(WEEK_1);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 5,
        weeks: 13,
        splitType: "Squat/Bench/Deadlift powerbuilding, 4-phase periodization (accumulation/transition/intensity/taper)",
        summary: "Layne Norton's PH3: a 13-week squat/bench/deadlift powerbuilding program, 5 training days across a 7-day week, periodized through accumulation, transition, intensity, and taper phases.",
        description: "PH3 centers on the big three lifts rather than a bodybuilding body-part split: two \"SBD\" days combining squat, bench, and deadlift work at moderate-to-heavy loads, plus dedicated hypertrophy and lower-body accessory days. The 13-week arc runs accumulation (weeks 1-4, higher volume), transition (5-8), intensity/overreaching (9-12, heavier and lower-rep), then a taper and 1RM test in week 13.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: [
          "https://www.jefit.com/routines/75880/ph3-layne-norton",
          "https://medium.com/@laff3855/ph3-layne-norton-does-it-work-who-is-it-for-6befb89b2bc",
        ],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, label: "Accumulation phase, week 1", repeatCount: 1 })
      .returning({ id: programWeeks.id });

    for (const [dayIndex, day] of WEEK_1.entries()) {
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
