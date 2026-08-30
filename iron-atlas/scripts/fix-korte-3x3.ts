import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Korte's 3x3 from a real, detailed source
 * (powerliftingtowin.com/korte-3x3/, itself citing Korte's original
 * DeepSquatter-archived articles). Two confirmed errors in the previous
 * version: it used Power Clean as the third lift where the real program
 * uses Deadlift (Squat/Bench/Deadlift, not Squat/Bench/Power Clean), and it
 * had no percentage progression or phase structure at all — the real
 * program is precisely percentage-based across two 4-week phases.
 *
 * Percentages are of a "projected max": take a true competition max (with
 * all gear) and add 25 lb to the squat, 10 lb to the bench, 15 lb to the
 * deadlift. All working percentages below are of that projected max, not
 * a plain training max.
 */

type Ex = { name: string; sets: number; reps: string; intensityValue: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const SBD = (squatPct: number, squatSets: number, squatReps: string, benchPct: number, benchSets: number, benchReps: string, deadPct: number, deadSets: number, deadReps: string, notes?: string): Ex[] => [
  { name: "Back Squat", sets: squatSets, reps: squatReps, intensityValue: String(squatPct), notes },
  { name: "Barbell Bench Press", sets: benchSets, reps: benchReps, intensityValue: String(benchPct), notes },
  { name: "Conventional Deadlift", sets: deadSets, reps: deadReps, intensityValue: String(deadPct), notes },
];

// Phase I: same workout 3x/week, only the percentage climbs each week (58% -> 64%).
const phaseIWeek = (pct: number): Day[] => {
  const day: Day = { name: "Full Body (Squat/Bench/Deadlift)", exercises: SBD(pct, 6, "5", pct, 7, "6", pct, 6, "5") };
  return [day, day, day];
};

// Phase II: a heavy single once/week per lift (Mon deadlift, Wed bench, Fri squat),
// climbing 80% -> 95% over 4 weeks; other work each day is 3x3@60% (5x4@60% for bench).
const phaseIIWeek = (singlePct: number): Day[] => [
  {
    name: "Deadlift Single Day",
    exercises: [
      { name: "Conventional Deadlift", sets: 1, reps: "1", intensityValue: String(singlePct), notes: "Heavy single. Full competition gear (belt, wraps, suit/shirt as applicable)." },
      { name: "Back Squat", sets: 3, reps: "3", intensityValue: "60" },
      { name: "Barbell Bench Press", sets: 5, reps: "4", intensityValue: "60" },
    ],
  },
  {
    name: "Bench Single Day",
    exercises: [
      { name: "Barbell Bench Press", sets: 1, reps: "1", intensityValue: String(singlePct), notes: "Heavy single. Full competition gear." },
      { name: "Back Squat", sets: 3, reps: "3", intensityValue: "60" },
      { name: "Conventional Deadlift", sets: 3, reps: "3", intensityValue: "60" },
    ],
  },
  {
    name: "Squat Single Day",
    exercises: [
      { name: "Back Squat", sets: 1, reps: "1", intensityValue: String(singlePct), notes: "Heavy single. Full competition gear." },
      { name: "Barbell Bench Press", sets: 5, reps: "4", intensityValue: "60" },
      { name: "Conventional Deadlift", sets: 3, reps: "3", intensityValue: "60" },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt from a detailed real source (powerliftingtowin.com/korte-3x3/, citing Korte's original DeepSquatter-archived articles). Two confirmed errors fixed:

1. Wrong third lift: the previous version used Power Clean; the real program is Squat/Bench/Deadlift. No accessory work is correct and unchanged — Korte's programming is famous for having "virtually zero assistance exercises."

2. Missing percentage/phase structure entirely: the real program is precisely percentage-based against a "projected max" (a true competition max, plus 25 lb squat / 10 lb bench / 15 lb deadlift), across two distinct 4-week phases. Phase I: the identical workout 3x/week (5-8 sets of 5 on squat/deadlift, 6-8 sets of 6 on bench), starting at 58% and climbing 2%/week. Phase II: a heavy single once a week per lift (deadlift Monday, bench Wednesday, squat Friday) in full competition gear, climbing 80% to 95% across the 4 weeks, with the other two lifts each day at 3x3@60% (bench uses 5x4@60% instead when it isn't the single of the day).

Korte's own suggested peaking plan continues past this 8-week block toward a week-9 meet — not modeled here, since this covers the base 2-phase cycle the source presents as the core program.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "korte-3x3"));
  if (!program) throw new Error("korte-3x3 not found");

  const weeks: Day[][] = [
    ...[58, 60, 62, 64].map(phaseIWeek),
    ...[80, 85, 90, 95].map(phaseIIWeek),
  ];

  console.log("resolving exercises...");
  const ids = await resolveAll(weeks);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 3,
        weeks: 8,
        splitType: "full body, squat/bench/deadlift every session, 2 phases (volume then singles)",
        summary: "Stephan Korte's 3x3: squat, bench, and deadlift trained 3x/week with virtually no accessory work, across a 4-week volume phase and a 4-week phase building to a heavy single on each lift.",
        description: "Phase I (weeks 1-4) runs the identical full-body workout 3 times a week — squat and deadlift for 5-8 sets of 5, bench for 6-8 sets of 6 — starting at 58% of a projected max and climbing 2% each week. Phase II (weeks 5-8) shifts to a heavy single once a week on each lift in full competition gear (deadlift Monday, bench Wednesday, squat Friday), climbing from 80% to 95% of the projected max, with the other two lifts each day held at 3x3@60% (5x4@60% for bench). \"Projected max\" means a true competition max plus 25 lb (squat), 10 lb (bench), or 15 lb (deadlift) — not a plain training max.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://www.powerliftingtowin.com/korte-3x3/"],
      })
      .where(eq(programs.id, program.id));

    for (const [weekIndex, week] of weeks.entries()) {
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
            intensityType: "percent_1rm",
            intensityValue: ex.intensityValue,
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
