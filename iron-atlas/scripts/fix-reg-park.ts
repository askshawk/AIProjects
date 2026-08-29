import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Fixes both Reg Park entries. The stored volume (15 sets/session for the
 * full 3-phase version, 24 for phases 2-3) was roughly half of what's
 * actually documented: a T-Nation reconstruction of the real program
 * ("archive.t-nation.com/training/reg-parks-5x5-program/") gives the real
 * exercise lists and set/rep schemes for all three phases, which land at
 * ~18 / ~38 / ~54 sets per session — closely matching an independently
 * found claim of "20 sets in phase 1, 38-39 in phase 2, 48-49 in phase 3",
 * two sources corroborating the same progression.
 *
 * Also corrects daysPerWeek: the source is explicit that all three phases
 * run 3 days a week, not 4 (reg-park-phase-2-3 previously claimed 4).
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };

const PHASE_1: Ex[] = [
  { name: "Back Extension", sets: 3, reps: "10", notes: "Loaded, 45-degree bench." },
  { name: "Back Squat", sets: 5, reps: "5" },
  { name: "Barbell Bench Press", sets: 5, reps: "5" },
  { name: "Conventional Deadlift", sets: 5, reps: "5" },
];

const PHASE_2: Ex[] = [
  { name: "Back Extension", sets: 4, reps: "10", notes: "Loaded, 45-degree bench." },
  { name: "Front Squat", sets: 5, reps: "5" },
  { name: "Back Squat", sets: 5, reps: "5" },
  { name: "Barbell Bench Press", sets: 5, reps: "5" },
  { name: "Overhead Press", sets: 5, reps: "5", notes: "Standing." },
  { name: "Barbell High Pull", sets: 5, reps: "5" },
  { name: "Conventional Deadlift", sets: 5, reps: "5" },
  { name: "Standing Calf Raise", sets: 5, reps: "25" },
];

const PHASE_3: Ex[] = [
  { name: "Back Extension", sets: 4, reps: "10", notes: "Loaded, 45-degree bench." },
  { name: "Front Squat", sets: 5, reps: "5" },
  { name: "Back Squat", sets: 5, reps: "5" },
  { name: "Overhead Press", sets: 5, reps: "5", notes: "Standing." },
  { name: "Barbell Bench Press", sets: 5, reps: "5" },
  { name: "Barbell Row", sets: 5, reps: "5", notes: "Bent-over." },
  { name: "Conventional Deadlift", sets: 5, reps: "5" },
  { name: "Behind-the-Neck Press", sets: 5, reps: "5", notes: "Source lists this or a one-arm dumbbell press as alternatives." },
  { name: "Barbell Curl", sets: 5, reps: "5" },
  { name: "EZ-Bar Skull Crusher", sets: 5, reps: "8", notes: "Lying triceps extension." },
  { name: "Standing Calf Raise", sets: 5, reps: "25" },
];

const SOURCE_URLS = ["https://archive.t-nation.com/training/reg-parks-5x5-program/"];

async function resolveAll(phases: Ex[][]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const p of phases) for (const ex of p) names.add(ex.name);
  const ids = new Map<string, number>();
  for (const name of names) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  return ids;
}

async function buildPhaseWeek(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  programId: number,
  weekNumber: number,
  label: string,
  repeatCount: number,
  phase: Ex[],
  ids: Map<string, number>,
) {
  const [week] = await tx
    .insert(programWeeks)
    .values({ programId, weekNumber, label, repeatCount })
    .returning({ id: programWeeks.id });

  for (const [dayIndex, dayName] of ["Monday", "Wednesday", "Friday"].entries()) {
    const [day] = await tx
      .insert(programDays)
      .values({ weekId: week.id, dayIndex, name: `Full Body — ${dayName}` })
      .returning({ id: programDays.id });

    for (const [order, ex] of phase.entries()) {
      await tx.insert(programExercises).values({
        dayId: day.id,
        exerciseId: ids.get(ex.name)!,
        order,
        sets: ex.sets,
        reps: ex.reps,
        intensityType: "none",
        notes: ex.notes ?? null,
      });
    }
  }
}

async function updateEquipment(programId: number) {
  const usedIds = await db
    .selectDistinct({ exerciseId: programExercises.exerciseId })
    .from(programExercises)
    .innerJoin(programDays, eq(programDays.id, programExercises.dayId))
    .innerJoin(programWeeks, eq(programWeeks.id, programDays.weekId))
    .where(eq(programWeeks.programId, programId));
  const equipRows = await db
    .select({ equipment: exercises.equipment })
    .from(exercises)
    .where(inArray(exercises.id, usedIds.map((r) => r.exerciseId)));
  await db
    .update(programs)
    .set({ equipmentRequired: [...new Set(equipRows.map((r) => r.equipment))] })
    .where(eq(programs.id, programId));
}

async function main() {
  const ids = await resolveAll([PHASE_1, PHASE_2, PHASE_3]);
  console.log(`resolved ${ids.size} exercises.`);

  // --- reg-park-5x5: all three phases, 36 weeks total, 3 days/week. ---
  const [full] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "reg-park-5x5"));
  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, full.id));
    await tx
      .update(programs)
      .set({
        daysPerWeek: 3,
        weeks: 36,
        splitType: "full body, 3 phases of escalating volume",
        confidence: "documented",
        confidenceNotes:
          "Exercise lists, sets, and reps for all three phases are taken directly from a T-Nation reconstruction of Reg Park's own published program (Strength & Bulk Training for Weight Lifters & Body Builders, 1960). The resulting session volume — about 18 sets in Phase 1, 38 in Phase 2, 54 in Phase 3 — closely matches an independently found summary citing 20/38-39/48-49 sets per phase, two sources agreeing on the same progression.",
        sourceUrls: SOURCE_URLS,
        verified: false,
      })
      .where(eq(programs.id, full.id));
    await buildPhaseWeek(tx, full.id, 1, "Phase 1", 12, PHASE_1, ids);
    await buildPhaseWeek(tx, full.id, 2, "Phase 2", 12, PHASE_2, ids);
    await buildPhaseWeek(tx, full.id, 3, "Phase 3", 12, PHASE_3, ids);
  });
  await updateEquipment(full.id);
  console.log("reg-park-5x5 done.");

  // --- reg-park-phase-2-3: phases 2 and 3 only, 24 weeks, 3 days/week (not 4). ---
  const [p23] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "reg-park-phase-2-3"));
  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, p23.id));
    await tx
      .update(programs)
      .set({
        daysPerWeek: 3,
        weeks: 24,
        splitType: "full body, phases 2 and 3 (higher volume)",
        confidence: "documented",
        confidenceNotes:
          "Same source as reg-park-5x5. The source is explicit that phases 2 and 3 run 3 days a week, not 4 — corrected from the previous version of this entry.",
        sourceUrls: SOURCE_URLS,
        verified: false,
      })
      .where(eq(programs.id, p23.id));
    await buildPhaseWeek(tx, p23.id, 1, "Phase 2", 12, PHASE_2, ids);
    await buildPhaseWeek(tx, p23.id, 2, "Phase 3", 12, PHASE_3, ids);
  });
  await updateEquipment(p23.id);
  console.log("reg-park-phase-2-3 done.");

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
