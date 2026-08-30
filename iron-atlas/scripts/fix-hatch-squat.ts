import "./env";
import { eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import { exercises, programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";

/**
 * Rebuilds the Hatch Squat Program with an important caveat this entry has
 * to carry: there is real, first-person dispute over what "the Hatch Squat
 * Cycle" actually is.
 *
 * The version that circulates everywhere online (hatchsquat.com, Lift Vault,
 * most fitness sites, and what the previous version of this entry was based
 * on) is, according to a blog post by a 17-year athlete of Coach Gayle Hatch
 * himself (brutetraining.com/blog/real-hatch-squat-cycle), a decoy template
 * Hatch handed out to a coach who asked for his "secrets" -- not his real
 * program. The account confirms only two things about the popular version
 * are genuine: squatting twice a week, and pairing front + back squat on
 * the same day. Volume and intensity, per the account, are "completely
 * different" from the real thing.
 *
 * The real program per that account: squats on Tuesday and Thursday
 * (Olympic lifts on Mon/Wed/Fri), always front AND back squat the same
 * day, only ever triples or sets of 5 (never 1-2 rep maxes, "Bucket 8"
 * high-rep days only once or twice a year), with whichever squat variant
 * goes first that day getting a weekly PR-attempt triple and the other
 * variant getting sets of 5 afterward -- then absolute-strength assistance
 * work (press variants, dips, curls, pull-ups, abs, hyperextensions).
 *
 * This is rebuilt in the style of the insider account rather than the
 * popular decoy version, since it's the more credible of the two, but the
 * exact accessory sets/reps and exact week-to-week PR progression aren't
 * independently confirmed beyond "attempt a PR every week unless it's a
 * deload" -- flagged honestly below.
 */

type Ex = { name: string; sets: number; reps: string; notes?: string };
type Day = { name: string; exercises: Ex[] };

const DAYS: Day[] = [
  {
    name: "Squat Day 1 (Tuesday)",
    exercises: [
      { name: "Back Squat", sets: 1, reps: "3", notes: "Weekly PR-attempt triple — go to a true max triple every week except deload weeks." },
      { name: "Front Squat", sets: 3, reps: "5" },
      { name: "Seated Barbell Overhead Press", sets: 3, reps: "5-8" },
      { name: "Weighted Chest Dip", sets: 3, reps: "8-10" },
      { name: "Pull-Up", sets: 3, reps: "8-10" },
      { name: "Back Extension", sets: 3, reps: "10-12" },
    ],
  },
  {
    name: "Squat Day 2 (Thursday)",
    exercises: [
      { name: "Front Squat", sets: 1, reps: "3", notes: "Weekly PR-attempt triple — the source describes this alternating which squat variant goes first." },
      { name: "Back Squat", sets: 3, reps: "5" },
      { name: "Push Press", sets: 3, reps: "5-8" },
      { name: "Incline Barbell Bench Press", sets: 3, reps: "8-10" },
      { name: "Barbell Curl", sets: 3, reps: "8-10" },
      { name: "Hanging Leg Raise", sets: 3, reps: "10-12" },
    ],
  },
];

const CONFIDENCE_NOTES = `Important caveat: there's real, first-person dispute over what the "Hatch Squat Cycle" actually is. The version that circulates everywhere online (which the previous version of this entry, hatchsquat.com, and most fitness sites are based on) is, per a blog post from a 17-year athlete of Coach Gayle Hatch himself, a decoy template Hatch handed to another coach who asked for his methods — not the real program. That account confirms only two things about the popular version are genuine: squatting twice a week, and pairing front + back squat on the same day; volume and intensity are described as "completely different" from the real thing.

This entry is rebuilt in the style of that insider account (which is the more credible of the two, but is still one person's account, not a published primary document): squats Tuesday and Thursday (Olympic lifts Monday/Wednesday/Friday, not modeled here), front and back squat both trained every squat day, never fewer than 3 reps or more than 8 (high-rep "Bucket 8" days only once or twice a year, not modeled), with whichever squat variant goes first each day getting a weekly PR-attempt triple and the other getting sets of 5, followed by absolute-strength assistance work (press variants, dips, curls, pull-ups, abs, hyperextensions).

The exact accessory sets/reps and the precise week-to-week structure beyond "attempt a PR every week except deload weeks" aren't given in the source at the level of detail this app's programs usually carry — the accessory prescriptions here are a reasonable, not verbatim, rendering.`;

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
  const [program] = await db.select({ id: programs.id }).from(programs).where(eq(programs.slug, "hatch-squat"));
  if (!program) throw new Error("hatch-squat not found");

  console.log("resolving exercises...");
  const ids = await resolveAll(DAYS);
  console.log(`resolved ${ids.size} exercises.`);

  await db.transaction(async (tx) => {
    await tx.delete(programWeeks).where(eq(programWeeks.programId, program.id));

    await tx
      .update(programs)
      .set({
        daysPerWeek: 2,
        weeks: 12,
        splitType: "front + back squat paired every squat session, twice a week",
        summary: "Gayle Hatch's squat program per a first-person account from one of his own athletes: squats twice a week (Tuesday/Thursday), front and back squat both trained every squat day, with a weekly PR-attempt triple on whichever variant goes first.",
        description: "Both front squat and back squat are trained every squat session — never separated onto different days. Whichever variant goes first that day gets a true, weekly PR-attempt triple; the other variant follows with sets of 5. Reps never go below 3 or above 8 (rare high-rep \"Bucket 8\" days aside). Squat work is followed by absolute-strength assistance (press variants, dips, curls, pull-ups, abs, hyperextensions). Olympic lift days (not modeled here) fill the other three weekdays.",
        confidence: "partial",
        confidenceNotes: CONFIDENCE_NOTES,
        verified: false,
        sourceUrls: ["https://www.brutetraining.com/blog/real-hatch-squat-cycle", "https://www.hatchsquat.com/program-overview/"],
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
