import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Fixes a genuinely garbled main-lift structure: the stored version had
 * each main lift's wave duplicated twice in the same session (1x1, 1x3,
 * 1x5, 1x5, 1x5, 1x3, 1x5, 1x5 — the classic 5/3/1 wave pattern, repeated),
 * which is neither "5's Pro" nor the classic wave done correctly. Real
 * "5's Pro" (from 5/3/1 Forever) is simple: all 3 weekly work sets at 5
 * reps, no wave at all. First Set Last (FSL) then adds 3-5 more sets at
 * the first work set's weight, for 5-8 reps each -- multiple backoff sets,
 * not the single "5x5" block stored before layering the wave on top.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const mainLift = (lift: string): Ex[] => [
  { name: lift, sets: 3, reps: "5", notes: "5's Pro: all 3 weekly work sets at 5 reps (no wave — this is what makes it \"5's Pro\" rather than the classic 5/3/1 wave)." },
  { name: lift, sets: 4, reps: "5-8", notes: "First Set Last (FSL): 3-5 backoff sets at the first work set's weight." },
];

const DAYS: Day[] = [
  { name: "Overhead Press Day", exercises: [...mainLift("Overhead Press"), { name: "Weighted Chest Dip", sets: 5, reps: "10" }, { name: "Chin-Up", sets: 5, reps: "10" }, { name: "Hanging Leg Raise", sets: 5, reps: "15" }] },
  { name: "Deadlift Day", exercises: [...mainLift("Conventional Deadlift"), { name: "Push-Up", sets: 5, reps: "10" }, { name: "Good Morning", sets: 5, reps: "10" }, { name: "Back Extension", sets: 5, reps: "10" }] },
  { name: "Bench Press Day", exercises: [...mainLift("Barbell Bench Press"), { name: "Dumbbell Bench Press", sets: 5, reps: "10" }, { name: "Barbell Row", sets: 5, reps: "10" }, { name: "Ab Wheel Rollout", sets: 5, reps: "10" }] },
  { name: "Squat Day", exercises: [...mainLift("Back Squat"), { name: "Leg Press", sets: 5, reps: "10" }, { name: "Lying Leg Curl", sets: 5, reps: "10" }, { name: "Hanging Leg Raise", sets: 5, reps: "15" }] },
];

const CONFIDENCE_NOTES = `Fixed a real, confirmed structural error: the previous version had each main lift's classic 5/3/1 wave (1x1, 1x3, 1x5, 1x5, 1x5, 1x3, 1x5, 1x5) duplicated within one session — that's neither "5's Pro" nor the standard wave done once. Real 5's Pro (from 5/3/1 Forever) is simple: all 3 weekly work sets at a flat 5 reps, no wave at all — that's the entire point of the name. First Set Last then adds 3-5 backoff sets at the first work set's weight for 5-8 reps each, not the single flat "5x5" block layered underneath the (wrongly duplicated) wave.

Exact percentages for the FSL backoff sets and the exact accessory volume aren't independently re-verified from a single source in this pass — the structural fix (correct main-lift scheme, correct FSL treatment) is what's confirmed here.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "531-5s-pro"));
  if (!program) throw new Error("531-5s-pro not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        confidence: "partial",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
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
