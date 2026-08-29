import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Sheiko Routine #37 from the actual document (a scanned "Monthly
 * Training Plan - 1, In base (preparation) period by coach Boris Sheiko"
 * PDF), transcribed directly rather than reconstructed from general Sheiko
 * knowledge — the previous version's own confidenceNotes already admitted
 * this wasn't done.
 *
 * The real program's defining feature — completely missing before — is
 * wave loading within a single session: the same lift is worked at several
 * different percentages/sets/reps in sequence, sometimes climbing then
 * descending in the same session (e.g. week 1 Friday bench: 50/55/60/65/70/
 * 75/70/65/60/55/50%). Each % step below is its own programExercises row.
 *
 * Two source-specific substitutions with no exact catalogue equivalent:
 * "deadlift from boxes" (deadlift performed standing on an elevated
 * platform, increasing range of motion) -> Deficit Deadlift. "Deadlift till
 * knees" (a partial pull, floor to knee height) -> Rack Pull is the closest
 * available partial-deadlift movement, though it's actually a top-range
 * partial rather than a bottom-range one — noted as an imperfect fit rather
 * than silently treated as equivalent.
 */

type Set = { pct: number; sets: number; reps: number };
type Line = { name: string; sets: Set[] | null; plain?: { sets: number; reps: string }; notes?: string };
type Day = { name: string; lines: Line[] };

const w = (pct: number, sets: number, reps: number): Set => ({ pct, sets, reps });

const WEEK_1: Day[] = [
  {
    name: "Squat/Bench A",
    lines: [
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 2), w(70, 3, 2), w(75, 3, 5)] },
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 5, 2), w(70, 3, 5)] },
      { name: "Barbell Bench Press", sets: [w(50, 6, 1), w(60, 4, 2), w(65, 6, 4)], notes: "Second bench block of the session." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Standing." },
    ],
  },
  {
    name: "Deadlift/Bench B",
    lines: [
      { name: "Conventional Deadlift", sets: [w(50, 5, 1), w(60, 4, 2), w(70, 4, 2), w(75, 3, 4)] },
      { name: "Incline Barbell Bench Press", sets: null, plain: { sets: 4, reps: "6" } },
      { name: "Chest Dip", sets: null, plain: { sets: 5, reps: "5" } },
      { name: "Deficit Deadlift", sets: [w(50, 5, 1), w(60, 5, 2), w(70, 4, 2), w(80, 3, 4)], notes: "Source: \"deadlift from boxes\" (elevated platform, increased ROM)." },
      { name: "Split Squat", sets: null, plain: { sets: 10, reps: "5" }, notes: "Source: \"squats scissors\", 5 reps each leg x 10 sets." },
      { name: "Sit-Up", sets: null, plain: { sets: 10, reps: "3" } },
    ],
  },
  {
    name: "Squat/Bench C",
    lines: [
      { name: "Barbell Bench Press", sets: [w(50, 7, 1), w(55, 6, 1), w(60, 5, 1), w(65, 4, 1), w(70, 3, 2), w(75, 2, 2), w(70, 3, 2), w(65, 4, 1), w(60, 6, 1), w(55, 8, 1), w(50, 10, 1)], notes: "Wave: climbs then descends in the same session." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 2), w(70, 3, 2), w(75, 3, 5)] },
      { name: "EZ-Bar Skull Crusher", sets: null, plain: { sets: 10, reps: "5" }, notes: "Source: \"French press.\"" },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Seated." },
    ],
  },
];

const WEEK_2: Day[] = [
  {
    name: "Squat/Bench A",
    lines: [
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 2), w(70, 3, 2), w(80, 2, 5)] },
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 1, 6)] },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 4, reps: "10" } },
      { name: "Weighted Push-Up", sets: null, plain: { sets: 10, reps: "5" }, notes: "Hands wider than shoulders." },
      { name: "Back Squat", sets: [w(55, 3, 1), w(65, 3, 3), w(75, 3, 4)], notes: "Second squat block of the session." },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Standing." },
    ],
  },
  {
    name: "Deadlift/Bench B",
    lines: [
      { name: "Rack Pull", sets: [w(50, 4, 1), w(60, 4, 2), w(70, 4, 4)], notes: "Source: \"deadlift till knees\" (partial ROM). Rack Pull is the closest catalogue equivalent, though it's a top-range partial rather than a bottom-range one." },
      { name: "Barbell Bench Press", sets: [w(50, 5, 4), w(60, 4, 1), w(70, 3, 5)] },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Conventional Deadlift", sets: [w(50, 4, 1), w(60, 4, 1), w(70, 3, 2), w(75, 3, 5)] },
      { name: "Split Squat", sets: null, plain: { sets: 10, reps: "5" }, notes: "Source: \"squats scissors.\"" },
    ],
  },
  {
    name: "Squat/Bench C",
    lines: [
      { name: "Back Squat", sets: [w(50, 4, 1), w(60, 4, 1), w(70, 3, 2), w(75, 3, 6)] },
      { name: "Barbell Bench Press", sets: [w(50, 6, 1), w(60, 4, 1), w(70, 3, 2), w(75, 3, 2), w(80, 2, 2), w(75, 4, 1), w(70, 5, 1), w(60, 6, 1), w(55, 7, 1), w(50, 8, 3)], notes: "Wave: climbs then descends." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Triceps Pushdown", sets: null, plain: { sets: 10, reps: "5" }, notes: "Source just says \"triceps.\"" },
      { name: "Back Squat", sets: [w(55, 3, 1), w(65, 3, 1), w(75, 3, 4)], notes: "Second squat block of the session." },
      { name: "Good Morning", sets: null, plain: { sets: 6, reps: "5" }, notes: "Seated." },
    ],
  },
];

const WEEK_3: Day[] = [
  {
    name: "Squat/Bench A",
    lines: [
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 2), w(70, 3, 2), w(80, 3, 5)] },
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 3, 5)] },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Weighted Push-Up", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(75, 3, 5)], notes: "Second squat block of the session." },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Standing." },
    ],
  },
  {
    name: "Deadlift/Bench B",
    lines: [
      { name: "Rack Pull", sets: [w(50, 4, 1), w(60, 4, 1), w(70, 3, 2), w(75, 3, 4)], notes: "Source: \"deadlift till knees.\"" },
      { name: "Barbell Bench Press", sets: [w(50, 5, 4), w(60, 4, 1), w(70, 3, 2), w(75, 3, 2), w(80, 2, 2), w(75, 3, 2), w(70, 4, 1), w(65, 5, 1), w(60, 6, 1), w(55, 7, 1), w(50, 8, 1)], notes: "Wave: climbs then descends." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Deficit Deadlift", sets: [w(60, 5, 1), w(70, 3, 2), w(80, 4, 6)], notes: "Source: \"deadlift from boxes.\"" },
      { name: "Split Squat", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Sit-Up", sets: null, plain: { sets: 10, reps: "3" } },
    ],
  },
  {
    name: "Squat/Bench C",
    lines: [
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 5, 1), w(70, 5, 2), w(75, 4, 5)] },
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 5, 1), w(70, 5, 2), w(75, 4, 5)] },
      { name: "Barbell Bench Press", sets: [w(50, 6, 1), w(60, 4, 1), w(65, 4, 5)], notes: "Second bench block of the session." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Standing." },
    ],
  },
];

const WEEK_4: Day[] = [
  {
    name: "Squat/Bench A",
    lines: [
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(85, 2, 3)] },
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 3, 5)] },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 4, reps: "10" } },
      { name: "Chest Dip", sets: null, plain: { sets: 8, reps: "5" } },
      { name: "Back Squat", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 2, 4)], notes: "Second squat block of the session." },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Standing." },
    ],
  },
  {
    name: "Deadlift/Bench B",
    lines: [
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 3, 2), w(85, 2, 3)] },
      { name: "Conventional Deadlift", sets: [w(50, 4, 1), w(60, 4, 1), w(70, 3, 2), w(80, 3, 2), w(85, 2, 3)] },
      { name: "Barbell Bench Press", sets: [w(55, 5, 1), w(65, 5, 1), w(75, 3, 4)], notes: "Second bench block of the session." },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Split Squat", sets: null, plain: { sets: 10, reps: "5" } },
    ],
  },
  {
    name: "Squat/Bench C",
    lines: [
      { name: "Back Squat", sets: [w(50, 4, 1), w(60, 4, 1), w(70, 3, 2), w(80, 3, 6)] },
      { name: "Barbell Bench Press", sets: [w(50, 5, 1), w(60, 4, 1), w(70, 3, 2), w(80, 5, 5)] },
      { name: "Dumbbell Fly", sets: null, plain: { sets: 10, reps: "5" } },
      { name: "Chest Dip", sets: null, plain: { sets: 8, reps: "5" } },
      { name: "Good Morning", sets: null, plain: { sets: 5, reps: "5" }, notes: "Seated." },
      { name: "Sit-Up", sets: null, plain: { sets: 10, reps: "3" } },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt from the actual source document (a scanned "Monthly Training Plan - 1, in base (preparation) period" PDF attributed to coach Boris Sheiko), transcribed session-by-session rather than reconstructed from general knowledge of Sheiko's methodology — the previous version admitted it hadn't done this.

The real program's defining feature, completely absent from the previous version: wave loading within a single session. The same lift (usually bench press) is worked at several different percentages/sets/reps in sequence, sometimes climbing then descending within one session (e.g. week 1's third session: 50/55/60/65/70/75/70/65/60/55/50%). The previous version had each lift appear once per session at a flat percentage, which understated both the real volume and the program's actual defining mechanic.

Two substitutions with no exact catalogue equivalent: "deadlift from boxes" (standing on an elevated platform, increasing range of motion) is mapped to Deficit Deadlift. "Deadlift till knees" (a partial pull, floor to knee height) is mapped to Rack Pull as the closest available partial-deadlift movement in the catalogue, though a rack pull is actually a top-range partial rather than a bottom-range one — noted here rather than silently treated as equivalent.

This is one 4-week "month" (the document is titled "Monthly Training Plan - 1"); the source appears to continue into further months not transcribed in this pass.`;

async function resolveAll(weeks: Day[][]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const week of weeks) for (const day of week) for (const line of day.lines) names.add(line.name);
  const ids = new Map<string, number>();
  for (const name of names) {
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve`);
    ids.set(name, r.id);
  }
  return ids;
}

async function main() {
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "sheiko-37"));
  if (!program) throw new Error("sheiko-37 not found");

  const allWeeks = [WEEK_1, WEEK_2, WEEK_3, WEEK_4];
  console.log("resolving exercises...");
  const ids = await resolveAll(allWeeks);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 3,
        weeks: 4,
        splitType: "3-day squat/bench/deadlift wave-loading (Sheiko method)",
        summary: "Boris Sheiko's Routine #37, transcribed from the real 'Monthly Training Plan - 1' document: 3 days/week, wave-loaded squat/bench/deadlift work with the same lift trained at several percentages within one session.",
        description: "Each session works squat and bench (and sometimes deadlift) at multiple percentages in sequence within the same workout, occasionally climbing up then back down (e.g. 50/55/60/65/70/75/70/65/60/55/50%) rather than one flat top set. Accessory work is minimal and consistent: dumbbell flies, good mornings, split squats, and light ab/triceps work appear repeatedly across sessions. The 4-week block is titled 'Monthly Training Plan - 1' in the source; further months likely follow.",
        confidence: "documented",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://truestrengthclub.yolasite.com/resources/Sheiko%2037.pdf"],
      })
      .where(eq(programs.id, program.id));

    for (const [weekIndex, week] of allWeeks.entries()) {
      const [savedWeek] = await tx
        .insert(programWeeks)
        .values({ programId: program.id, weekNumber: weekIndex + 1, repeatCount: 1 })
        .returning({ id: programWeeks.id });

      for (const [dayIndex, day] of week.entries()) {
        const [savedDay] = await tx
          .insert(programDays)
          .values({ weekId: savedWeek.id, dayIndex, name: day.name })
          .returning({ id: programDays.id });

        let order = 0;
        for (const line of day.lines) {
          const exerciseId = ids.get(line.name)!;
          if (line.sets) {
            for (const s of line.sets) {
              await tx.insert(programExercises).values({
                dayId: savedDay.id,
                exerciseId,
                order: order++,
                sets: s.sets,
                reps: String(s.reps),
                intensityType: "percent_1rm",
                intensityValue: String(s.pct),
                notes: line.notes ?? null,
              });
            }
          } else if (line.plain) {
            await tx.insert(programExercises).values({
              dayId: savedDay.id,
              exerciseId,
              order: order++,
              sets: line.plain.sets,
              reps: line.plain.reps,
              intensityType: "none",
              notes: line.notes ?? null,
            });
          }
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
