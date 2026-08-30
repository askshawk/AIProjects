import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds The Best Damn Workout Plan For Natural Lifters around its real,
 * confirmed defining mechanic (t-nation.com/t/best-plan-for-the-natural-lifter/233030
 * and related T-Nation threads): a 6-day push/pull split where each muscle
 * group gets only ONE exercise per session, for 3 total sets — 2 warm-up
 * sets plus 1 all-out hard set (rest-pause, drop-set, or eccentric-focused).
 * Thibaudeau's core argument for natural lifters is that the session itself
 * is the growth trigger, so frequency matters more than volume; the
 * previous version was a 4-day upper/lower split with 5-7 exercises per
 * session, which is the opposite of the program's whole premise.
 *
 * Exact exercise selection for the real template wasn't found at the
 * source-quote level -- one representative exercise per muscle group is
 * used here, clearly flagged as representative rather than verbatim.
 */

type Ex = { name: string; notes: string };
type Day = { name: string; exercises: Ex[] };

const WARMUP_HARD_NOTE = "2 warm-up sets, then 1 all-out hard set (rest-pause, drop-set, or slow eccentric) — the entire session for this muscle group.";

const PUSH: Ex[] = [
  { name: "Barbell Bench Press", notes: `Chest. ${WARMUP_HARD_NOTE}` },
  { name: "Seated Barbell Overhead Press", notes: `Shoulders. ${WARMUP_HARD_NOTE}` },
  { name: "Triceps Pushdown", notes: `Triceps. ${WARMUP_HARD_NOTE}` },
  { name: "Back Squat", notes: `Quads. ${WARMUP_HARD_NOTE}` },
];

const PULL: Ex[] = [
  { name: "Barbell Row", notes: `Back. ${WARMUP_HARD_NOTE}` },
  { name: "Barbell Curl", notes: `Biceps. ${WARMUP_HARD_NOTE}` },
  { name: "Romanian Deadlift", notes: `Hamstrings/glutes. ${WARMUP_HARD_NOTE}` },
  { name: "Standing Calf Raise", notes: `Calves. ${WARMUP_HARD_NOTE}` },
];

const DAYS: Day[] = [
  { name: "Push A", exercises: PUSH },
  { name: "Pull A", exercises: PULL },
  { name: "Push B", exercises: PUSH },
  { name: "Pull B", exercises: PULL },
  { name: "Push C", exercises: PUSH },
  { name: "Pull C", exercises: PULL },
];

const CONFIDENCE_NOTES = `Rebuilt around the program's real, confirmed defining mechanic (t-nation.com/t/best-plan-for-the-natural-lifter/233030 and related T-Nation threads): a 6-day push/pull split where each muscle group gets only ONE exercise per session, for 3 total sets — 2 warm-up sets plus 1 all-out hard set (rest-pause, drop-set, or slow eccentric). Thibaudeau's core argument is that natural lifters recover far more slowly than enhanced ones, so the session itself needs to be the growth trigger — high frequency, deliberately low volume. The previous version of this entry was a 4-day upper/lower split with 5-7 exercises per session, which is the opposite of the program's entire premise.

Exact exercise selection for the real template wasn't found at the source-quote level — one representative exercise per muscle group is used here (chest, shoulders, triceps, quads on Push; back, biceps, hamstrings, calves on Pull), clearly a representative rendering rather than a verified transcript of Thibaudeau's specific movement choices.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "thib-best-damn"));
  if (!program) throw new Error("thib-best-damn not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 6,
        splitType: "6-day push/pull, one exercise per muscle group per session (2 warm-up sets + 1 hard set)",
        summary: "Christian Thibaudeau's natural-lifter template: 6 days a week split into push and pull sessions, with just ONE exercise per muscle group each time — 2 warm-up sets and a single all-out hard set. High frequency, deliberately low volume, built around the idea that natural lifters can't recover from (or need) the volume enhanced lifters use.",
        description: "Each Push day covers chest, shoulders, triceps, and quads; each Pull day covers back, biceps, hamstrings, and calves — one exercise apiece, 2 warm-up sets building to a single hard set taken to failure with an intensity technique (rest-pause, drop-set, or slow eccentric). The whole point is frequency over volume: for a natural lifter, the training session itself is what triggers muscle growth, so hitting every muscle group 3x/week with minimal fatigue beats a higher-volume split trained less often.",
        confidence: "partial",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://t-nation.com/t/best-plan-for-the-natural-lifter/233030"],
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
          sets: 3,
          reps: "6-10",
          intensityType: "none",
          notes: ex.notes,
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
