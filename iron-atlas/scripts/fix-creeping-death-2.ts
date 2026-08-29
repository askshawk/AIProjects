import "./env";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import {
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds Creeping Death II from real, sourced content.
 *
 * The generated version was catastrophically wrong: 1 day/week, 4 weeks,
 * 7 total sets — the model mistook Meadows' famous standalone leg-day
 * finisher for the whole program. The real Creeping Death II is a 12-week,
 * 6-day Pull/Push/Legs + pump-day split.
 *
 * Sourced from two real, corroborating week breakdowns (JeFit's "Creeping
 * Death by Meadows" week 1 and week 2 pages) plus structural confirmation
 * from a Mountain Dog Diet program description and a bodybuilding forum
 * thread. Weeks 3-12 are NOT individually confirmed from these sources —
 * only the structure (6-day PPL+pump, 12 weeks total) and these two
 * concrete weeks are. `confidence` and the notes say so plainly.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const WEEK_1: Day[] = [
  {
    name: "Pull",
    exercises: [
      { name: "Meadows Row", sets: 4, reps: "8" },
      { name: "Chin-Up", sets: 3, reps: "8", notes: "With a knee raise at the top." },
      { name: "Dumbbell Pullover", sets: 3, reps: "10" },
      { name: "Dumbbell Shrug", sets: 3, reps: "12" },
      { name: "Back Extension", sets: 3, reps: "10", notes: "Loaded (barbell hyperextension)." },
      { name: "Hanging Leg Raise", sets: 4, reps: "20", notes: "Source specifies a decline-bench leg raise; the catalogue's closest equivalent is used." },
      { name: "Preacher Curl", sets: 4, reps: "10", notes: "Dumbbell, alternating arms." },
      { name: "Hammer Curl", sets: 4, reps: "8" },
    ],
  },
  {
    name: "Push",
    exercises: [
      { name: "Incline Dumbbell Press", sets: 4, reps: "8", notes: "~15-degree incline." },
      { name: "Incline Barbell Bench Press", sets: 3, reps: "6" },
      { name: "Machine Chest Press", sets: 1, reps: "8" },
      { name: "Cable Fly", sets: 3, reps: "8" },
      { name: "Cable Fly", sets: 3, reps: "8", notes: "Machine pec-deck variant of the prior fly, per source." },
      { name: "Cable Rear Delt Fly", sets: 4, reps: "15", notes: "Source specifies a reverse-fly machine." },
      { name: "Machine Chest Press", sets: 4, reps: "6", notes: "\"Cage press\" in the source — Mountain Dog gym's rack/cage press setup." },
      { name: "Weighted Chest Dip", sets: 3, reps: "10", notes: "Source describes an assisted dip-machine triceps pushdown; mapped to the closest catalogue dip movement." },
      { name: "EZ-Bar Skull Crusher", sets: 4, reps: "12", notes: "Reverse grip." },
    ],
  },
  {
    name: "Legs",
    exercises: [
      { name: "Seated Leg Curl", sets: 4, reps: "10" },
      { name: "Back Squat", sets: 5, reps: "8", notes: "Full depth." },
      { name: "Bulgarian Split Squat", sets: 4, reps: "8", notes: "Drop sets." },
      { name: "Stiff-Leg Deadlift", sets: 2, reps: "10" },
      { name: "Standing Calf Raise", sets: 6, reps: "10" },
    ],
  },
  {
    name: "Pull (Pump)",
    exercises: [
      { name: "Seated Cable Row", sets: 4, reps: "10" },
      { name: "Reverse-Grip Lat Pulldown", sets: 4, reps: "10", notes: "Close grip." },
      { name: "Face Pull", sets: 4, reps: "10" },
      { name: "Dumbbell Pullover", sets: 4, reps: "8" },
      { name: "Cross-Body Hammer Curl", sets: 4, reps: "10" },
      { name: "Barbell Curl", sets: 3, reps: "21", notes: "\"21s\": 7 bottom-half + 7 top-half + 7 full-range reps." },
      { name: "Cable Crunch", sets: 4, reps: "20", notes: "Kneeling, rope attachment." },
    ],
  },
  {
    name: "Push (Pump)",
    exercises: [
      { name: "Decline Dumbbell Press", sets: 4, reps: "12", notes: "Slight decline." },
      { name: "Floor Press", sets: 4, reps: "10", notes: "Performed with dumbbells per source." },
      { name: "Cable Fly", sets: 4, reps: "8" },
      { name: "Dumbbell Lateral Raise", sets: 4, reps: "15" },
      { name: "Seated Dumbbell Shoulder Press", sets: 4, reps: "10" },
      { name: "Rope Pushdown", sets: 4, reps: "10" },
      { name: "Overhead Cable Triceps Extension", sets: 4, reps: "10", notes: "Seated." },
    ],
  },
  {
    name: "Legs (Pump)",
    exercises: [
      { name: "Leg Extension", sets: 3, reps: "12" },
      { name: "Leg Press", sets: 3, reps: "10" },
      { name: "Walking Lunge", sets: 3, reps: "8", notes: "Source specifies dumbbell lunges." },
      { name: "Seated Leg Curl", sets: 3, reps: "15" },
      { name: "Seated Calf Raise", sets: 6, reps: "15" },
    ],
  },
];

const WEEK_2: Day[] = [
  {
    name: "Pull",
    exercises: [
      { name: "Meadows Row", sets: 4, reps: "10" },
      { name: "Reverse-Grip Lat Pulldown", sets: 3, reps: "8", notes: "Close grip." },
      { name: "Dumbbell Pullover", sets: 3, reps: "10" },
      { name: "Rack Pull", sets: 5, reps: "5" },
      { name: "Back Extension", sets: 2, reps: "20" },
      { name: "EZ-Bar Curl", sets: 4, reps: "8" },
      { name: "Hammer Curl", sets: 4, reps: "10", notes: "Incline bench, per source." },
    ],
  },
  {
    name: "Push",
    exercises: [
      { name: "Incline Dumbbell Press", sets: 4, reps: "10", notes: "~15-degree incline." },
      { name: "Incline Barbell Bench Press", sets: 3, reps: "8" },
      { name: "Weighted Chest Dip", sets: 4, reps: "AMRAP", notes: "Source: \"Weighted Tricep Dip\", set count only." },
      { name: "Cable Fly", sets: 3, reps: "8" },
      { name: "Cable Fly", sets: 3, reps: "8", notes: "Machine pec-deck variant of the prior fly, per source." },
      { name: "Cable Rear Delt Fly", sets: 4, reps: "20", notes: "Source specifies a reverse-fly machine." },
      { name: "Machine Chest Press", sets: 4, reps: "6", notes: "\"Cage press\" in the source." },
      { name: "EZ-Bar Skull Crusher", sets: 4, reps: "12", notes: "Reverse grip." },
    ],
  },
  {
    name: "Legs",
    exercises: [
      { name: "Standing Calf Raise", sets: 6, reps: "10" },
      { name: "Back Squat", sets: 5, reps: "6", notes: "Full depth." },
      { name: "Seated Leg Curl", sets: 4, reps: "10" },
      { name: "Bulgarian Split Squat", sets: 4, reps: "8", notes: "Drop sets." },
      { name: "Stiff-Leg Deadlift", sets: 2, reps: "10" },
    ],
  },
  {
    name: "Pull (Pump)",
    exercises: [
      { name: "Cable Crunch", sets: 4, reps: "20", notes: "Kneeling, rope attachment." },
      { name: "Seated Cable Row", sets: 4, reps: "10" },
      { name: "Reverse-Grip Lat Pulldown", sets: 4, reps: "10", notes: "Close grip." },
      { name: "Face Pull", sets: 4, reps: "10" },
      { name: "Dumbbell Pullover", sets: 4, reps: "8" },
      { name: "Cross-Body Hammer Curl", sets: 4, reps: "10" },
      { name: "Barbell Curl", sets: 3, reps: "21", notes: "\"21s\": 7 bottom-half + 7 top-half + 7 full-range reps." },
    ],
  },
  {
    name: "Push (Pump)",
    exercises: [
      { name: "Decline Dumbbell Press", sets: 4, reps: "12", notes: "Slight decline." },
      { name: "Floor Press", sets: 4, reps: "10", notes: "Performed with dumbbells per source." },
      { name: "Cable Fly", sets: 4, reps: "8", notes: "Source lists a separate dumbbell fly here; folded into this cable fly slot." },
      { name: "Dumbbell Lateral Raise", sets: 4, reps: "15" },
      { name: "Seated Dumbbell Shoulder Press", sets: 4, reps: "10" },
      { name: "Rope Pushdown", sets: 4, reps: "10" },
      { name: "Overhead Cable Triceps Extension", sets: 4, reps: "10", notes: "Seated." },
    ],
  },
  {
    name: "Legs (Pump)",
    exercises: [
      { name: "Walking Lunge", sets: 3, reps: "8", notes: "Source specifies dumbbell lunges." },
      { name: "Leg Press", sets: 3, reps: "20" },
      { name: "Leg Extension", sets: 3, reps: "12" },
      { name: "Seated Calf Raise", sets: 6, reps: "15" },
      { name: "Seated Leg Curl", sets: 3, reps: "15" },
    ],
  },
];

const CONFIDENCE_NOTES = `Rebuilt by hand from real, sourced content, not model-generated. The previous version of this program was a serious error: it depicted "Creeping Death II" as a single one-day-per-week leg specialization block, which is not what the program is. That happened because the reconstruction request asked for the program by name alone, and the model most likely conflated a famous standalone Meadows leg-day finisher (also informally called "Creeping Death") with the actual 6-day program that shares the name.

What's confirmed here: the real structure is a 12-week, 6-day-per-week Pull/Push/Legs split with alternating "base" days (heavier, lower rep) and "pump" days (higher rep, more isolation work), Sunday off. Two full weeks of exact exercises, sets, and reps are sourced directly (JeFit's "Creeping Death by Meadows" week 1 and week 2 pages), corroborated by a Mountain Dog Diet program description and a bodybuilding forum thread describing the same push/pull/legs shape and rationale (pull before push, to rest the lower back between deadlift-adjacent and squat-adjacent days).

What's NOT confirmed: the exact exercise selection and loading for weeks 3 through 12. Real Meadows programs typically progress in intensity and vary specific movements week to week, and that progression is not available from the sources checked. Treat weeks 1-2 as accurate and the overall 12-week, 6-day structure as correct; treat the exact contents of weeks 3-12 as reasonably inferred from the same pattern, not individually verified.`;

/**
 * Resolves every exercise name up front, with progress printed as it goes —
 * network calls (the similarity tier falls back to Voyage) must never happen
 * inside an open transaction. PGlite allows exactly one live connection; a
 * slow or rate-limited lookup held mid-transaction blocks every other query
 * against the database, including the running dev server, until it times out.
 * This is the same ordering programGeneration.ts already uses correctly.
 */
async function resolveAll(weeks: Day[][]): Promise<Map<string, number>> {
  const names = new Set<string>();
  for (const week of weeks) for (const day of week) for (const ex of day.exercises) names.add(ex.name);

  const resolved = new Map<string, number>();
  let i = 0;
  for (const name of names) {
    i++;
    process.stdout.write(`  resolving ${i}/${names.size}: ${name}...`);
    const r = await resolveExerciseName(name);
    if (!r) throw new Error(`"${name}" did not resolve against the catalogue`);
    console.log(` -> ${r.name} (${r.via})`);
    resolved.set(name, r.id);
  }
  return resolved;
}

async function buildWeek(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  programId: number,
  weekNumber: number,
  days: Day[],
  exerciseIds: Map<string, number>,
) {
  const [week] = await tx
    .insert(programWeeks)
    .values({ programId, weekNumber, repeatCount: 1 })
    .returning({ id: programWeeks.id });

  for (const [dayIndex, day] of days.entries()) {
    const [savedDay] = await tx
      .insert(programDays)
      .values({ weekId: week.id, dayIndex, name: day.name })
      .returning({ id: programDays.id });

    for (const [order, ex] of day.exercises.entries()) {
      await tx.insert(programExercises).values({
        dayId: savedDay.id,
        exerciseId: exerciseIds.get(ex.name)!,
        order,
        sets: ex.sets,
        reps: ex.reps,
        intensityType: "none",
        notes: ex.notes ?? null,
      });
    }
  }
}

async function main() {
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, "meadows-creeping-death-2"));
  if (!program) throw new Error("meadows-creeping-death-2 not found");

  console.log("resolving exercises against the catalogue (outside any transaction)...");
  const exerciseIds = await resolveAll([WEEK_1, WEEK_2]);
  console.log(`all ${exerciseIds.size} distinct exercises resolved.\n`);

  await db.transaction(async (tx) => {
    // Cascades clear the old (wrong) weeks/days/exercises.
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 6,
        weeks: 12,
        splitType: "6-day Pull/Push/Legs with alternating base and pump days",
        confidence: "partial",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: [
          "https://www.jefit.com/routines/468549/creeping-death-by-meadows",
          "https://www.jefit.com/routines/470327/creeping-death-by-meadows-wk2",
          "https://mountaindogdiet.com/programs/creeping-death-2/",
        ],
      })
      .where(eq(programs.id, program.id));

    await buildWeek(tx, program.id, 1, WEEK_1, exerciseIds);
    await buildWeek(tx, program.id, 2, WEEK_2, exerciseIds);
  });

  const [check] = await db
    .select({
      daysPerWeek: programs.daysPerWeek,
      weeks: programs.weeks,
      confidence: programs.confidence,
    })
    .from(programs)
    .where(eq(programs.slug, "meadows-creeping-death-2"));
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int n from program_exercises pe
    join program_days pd on pd.id = pe.day_id
    join program_weeks pw on pw.id = pd.week_id
    where pw.program_id = ${program.id}
  `;
  console.log("updated program:", check);
  console.log("total prescribed sets now:", n);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
