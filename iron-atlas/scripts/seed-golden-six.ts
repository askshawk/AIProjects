import "./env";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { programDays, programExercises, programWeeks, programs } from "@/db/schema";
import { resolveExerciseName } from "@/lib/exerciseResolver";
import { tryEmbedOne } from "@/lib/embeddings";

/**
 * One hand-transcribed program, so the library is never empty and the UI has
 * something to render before the generator runs. It's also the reference for
 * what a *verified* entry looks like next to the AI-reconstructed ones.
 *
 * Arnold's "Golden Six" is about as uncontroversial as program data gets: six
 * movements, published in Education of a Bodybuilder and repeated everywhere.
 */
const GOLDEN_SIX = [
  { name: "Back Squat", sets: 4, reps: "10", notes: "The whole session is built around this." },
  { name: "Barbell Bench Press", sets: 3, reps: "10", notes: "Wide grip, full range." },
  { name: "Chin-Up", sets: 3, reps: "AMRAP", notes: "Behind the neck in the original; do what your shoulders tolerate." },
  { name: "Overhead Press", sets: 4, reps: "10", notes: "Behind the neck in the original." },
  { name: "Barbell Curl", sets: 3, reps: "10", notes: "Strict, no swinging." },
  { name: "Sit-Up", sets: 3, reps: "AMRAP", notes: "Bent legs." },
];

async function main() {
  const slug = "arnold-golden-six";

  const resolved = await Promise.all(
    GOLDEN_SIX.map(async (e) => {
      const match = await resolveExerciseName(e.name);
      if (!match) throw new Error(`"${e.name}" is not in the exercise catalogue`);
      return { ...e, exerciseId: match.id };
    }),
  );

  const summary =
    "Arnold's beginner routine: six compound lifts, three days a week, full body every session.";

  const embedding = await tryEmbedOne(
    [
      "Arnold's Golden Six",
      "Arnold Schwarzenegger",
      summary,
      "full body",
      "general_fitness beginner 3 days per week",
      "classic, full body, barbell, beginner",
    ].join(". "),
  );

  await db.transaction(async (tx) => {
    await tx.delete(programs).where(eq(programs.slug, slug));

    const [program] = await tx
      .insert(programs)
      .values({
        slug,
        title: "Arnold's Golden Six",
        authorName: "Arnold Schwarzenegger",
        sourceUrls: [],
        summary,
        description:
          "Six exercises, three days a week, every session the same. Arnold used this as his own starting routine and recommended it to beginners for the first six to twelve months of training.\n\nThe logic is that a novice grows fastest from getting strong on a handful of big lifts performed often, not from splitting the body into parts. Add weight whenever you complete all sets at the target reps with clean form — that progression *is* the program. Rest two to three minutes between sets of squats and presses, less on curls and sit-ups.\n\nRun it Monday/Wednesday/Friday until it stops producing progress, which for most people takes several months.",
        goal: "general_fitness",
        experienceLevel: "beginner",
        daysPerWeek: 3,
        weeks: 12,
        splitType: "full body",
        progression: "linear",
        equipmentRequired: ["barbell", "bodyweight"],
        tags: ["classic", "full body", "barbell", "beginner"],
        aiGenerated: false,
        verified: true,
        embedding,
      })
      .returning({ id: programs.id });

    const [week] = await tx
      .insert(programWeeks)
      .values({
        programId: program.id,
        weekNumber: 1,
        label: null,
        notes: "Every week is identical. Add weight whenever all sets hit the target reps.",
        repeatCount: 12,
      })
      .returning({ id: programWeeks.id });

    for (const [dayIndex, name] of ["Day 1", "Day 2", "Day 3"].entries()) {
      const [day] = await tx
        .insert(programDays)
        .values({ weekId: week.id, dayIndex, name, notes: null })
        .returning({ id: programDays.id });

      await tx.insert(programExercises).values(
        resolved.map((e, i) => ({
          dayId: day.id,
          exerciseId: e.exerciseId,
          order: i,
          sets: e.sets,
          reps: e.reps,
          intensityType: "none" as const,
          restSeconds: 120,
          notes: e.notes,
        })),
      );
    }
  });

  console.log(`seeded /programs/${slug}`);
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
