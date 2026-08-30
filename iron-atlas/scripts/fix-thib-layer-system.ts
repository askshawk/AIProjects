import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds The Layer System from the real source (t-nation.com/t/the-layer-system/285564,
 * by Christian Thibaudeau). The real program's headline claim, missed
 * entirely by the previous version, is right in its own subtitle: "Build
 * Strength and Size With One Exercise A Day." Every session is ONE lift,
 * worked through 5 sequential "layers" of different training methods — not
 * a multi-exercise split with accessories, which is what was stored before.
 *
 * The source's own bar-position guide names exactly 5 candidate lifts:
 * Bench Press, Squat, Incline Bench Press, Snatch-Grip High Pull, and
 * Preacher Curl. Using the first 4 as a 4-day rotation (Preacher Curl noted
 * as an optional 5th application of the method for arm specialization,
 * matching an independent structural summary found earlier this session).
 *
 * Layers 1-3 have exact, sourced numbers from the article. Layers 4
 * (Slow Eccentrics) and 5 (Growth Factor Release / metabolic pump) are named
 * in the source but exact set/rep/tempo numbers weren't found in the
 * accessible portion of the article (paywalled past layer 3) — these two
 * are a reasonable, clearly-flagged approximation, not sourced numbers.
 */

type Layer = { name: string; sets: number; reps: string; notes: string };

function layersFor(lift: string): Layer[] {
  return [
    { name: lift, sets: 4, reps: "6s hold", notes: "Layer 1 - Activation & Potentiation: overcoming isometric against safety pins, max effort, 60s rest between sets." },
    { name: lift, sets: 6, reps: "2", notes: "Layer 2 - Max Strength & Further Potentiation: ramp from ~60-70% to a 2RM over 5-7 sets, ~2 min rest." },
    { name: lift, sets: 3, reps: "4-6", notes: "Layer 3 - Mechanical Stress: cluster set at 90% of the layer-2 2RM, 10-12s rest between individual reps within each set." },
    { name: lift, sets: 3, reps: "3-5", notes: "Layer 4 - Slow Eccentrics (named in the source; exact load/tempo not accessible past the paywall — reasonable approximation, not a sourced number)." },
    { name: lift, sets: 2, reps: "15-20", notes: "Layer 5 - Growth Factor Release / metabolic pump finisher (named in the source; exact prescription not accessible past the paywall — reasonable approximation, not a sourced number)." },
  ];
}

const DAYS = [
  { name: "Bench Press Day", lift: "Barbell Bench Press" },
  { name: "Squat Day", lift: "Back Squat" },
  { name: "Incline Bench Press Day", lift: "Incline Barbell Bench Press" },
  { name: "Snatch-Grip High Pull Day", lift: "Barbell High Pull", note: "Source specifies a snatch-grip high pull; the catalogue's closest equivalent is used." },
];

const CONFIDENCE_NOTES = `Rebuilt from the real source (t-nation.com/t/the-layer-system/285564). The program's own subtitle is the headline fact the previous version missed entirely: "Build Strength and Size With One Exercise A Day." Every session is ONE lift taken through 5 sequential layers of different training methods (overcoming isometrics -> ramp to a 2RM -> cluster set -> slow eccentrics -> a metabolic pump finisher) — not a multi-exercise split with accessory work, which is what was stored before.

Layers 1-3 have exact numbers directly from the article (4x6-second isometric holds, a 5-7 set ramp to a 2RM, then a 3x4-6 cluster at 90% of that 2RM). Layers 4 (Slow Eccentrics) and 5 (Growth Factor Release) are named in the source but the article is paywalled past layer 3 — the specific numbers for those two are a reasonable approximation, not sourced numbers, and are labeled as such on each row.

The source's own bar-position guide names exactly 5 candidate lifts: Bench Press, Squat, Incline Bench Press, Snatch-Grip High Pull, and Preacher Curl. This entry uses the first 4 as a 4-day rotation; Preacher Curl is mentioned in the source as a further application (likely for arm specialization) rather than a core day, consistent with an independent summary found earlier describing this as a 4-day structure.`;

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "thib-layer-system"));
  if (!program) throw new Error("thib-layer-system not found");

  const liftNames = [...new Set(DAYS.map((d) => d.lift))];
  console.log("resolving exercises...");
  const ids = new Map<string, number>();
  for (const name of liftNames) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 4,
        weeks: 8,
        splitType: "one exercise per day, 5 sequential training-method 'layers' applied to that single lift",
        summary: "Christian Thibaudeau's Layer System: one exercise per training day, worked through 5 sequential layers (isometric activation, a ramp to a 2RM, a cluster set, slow eccentrics, then a metabolic pump finisher) — real volume from method-stacking on a single lift, not from a multi-exercise split.",
        description: "Each session picks one of the day's main lift (bench press, squat, incline bench press, or snatch-grip high pull) and takes it through 5 layers in sequence, each a different training method building on the potentiation created by the one before: overcoming isometrics against safety pins, then a rapid ramp to a true 2RM, then a mechanical-stress cluster set at 90% of that 2RM, then slow eccentrics, then a metabolic pump finisher. There is no other exercise work in a session.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://t-nation.com/t/the-layer-system/285564"],
      })
      .where(eq(programs.id, program.id));

    const [week] = await tx
      .insert(programWeeks)
      .values({ programId: program.id, weekNumber: 1, repeatCount: 8 })
      .returning({ id: programWeeks.id });

    for (const [dayIndex, day] of DAYS.entries()) {
      const [savedDay] = await tx
        .insert(programDays)
        .values({ weekId: week.id, dayIndex, name: day.name })
        .returning({ id: programDays.id });

      const layers = layersFor(day.lift);
      for (const [order, layer] of layers.entries()) {
        await tx.insert(programExercises).values({
          dayId: savedDay.id,
          exerciseId: ids.get(day.lift)!,
          order,
          sets: layer.sets,
          reps: layer.reps,
          intensityType: "none",
          notes: order === 0 && day.note ? `${day.note} ${layer.notes}` : layer.notes,
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
