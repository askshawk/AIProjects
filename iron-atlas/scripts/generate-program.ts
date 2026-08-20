import "./env";
import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { db, sql } from "@/db";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";
import { slugify } from "@/data/parseExercises";
import { tryEmbedOne } from "@/lib/embeddings";
import { resolveExerciseName, type ResolvedExercise } from "@/lib/exerciseResolver";
import {
  generatedProgramJsonSchema,
  generatedProgramSchema,
  type GeneratedProgram,
} from "@/lib/programSchema";

/**
 * Reconstructs a well-known training program into the library schema.
 *
 *   npm run generate:program -- "Arnold's Golden Six"
 *   npm run generate:program -- "5/3/1 Boring But Big" --slug 531-bbb
 *
 * The model proposes structure; the exercise catalogue decides what's valid.
 * Every prescribed movement is resolved against `exercises` before anything is
 * written, and an unresolvable name aborts the whole program rather than
 * silently inventing a row.
 */

const MODEL = "claude-opus-5";

const SYSTEM = `You are a strength-training librarian. You reconstruct well-known lifting programs into a structured format for a training app.

Accuracy rules, in order of importance:
1. Only prescribe exercises from the catalogue you are given, using the exact catalogue name. If a program calls for a movement that isn't in the catalogue, choose the closest catalogue entry and say so in confidenceNotes.
2. Never present a guess as fact. In confidenceNotes, state plainly which parts of the program you are confident about and which you are reconstructing from the author's general style.
3. Preserve what makes the program distinctive — its set/rep schemes, exercise order, intensity prescriptions, and progression rules. A generic program under a famous name is worse than no program.
4. If weeks differ (wave loading, 5/3/1 cycles), produce a week per variation. If every week is identical, produce one week with repeatCount set to the block length.
5. Only include sourceUrls you are confident actually exist. An empty array is better than a fabricated link.`;

function usage(): never {
  console.error(
    'usage: npm run generate:program -- "<program or lifter name>" [--slug <slug>] [--dry-run]',
  );
  process.exit(1);
}

async function catalogueText(): Promise<string> {
  const rows = await db
    .select({
      name: exercises.name,
      pattern: exercises.movementPattern,
      muscle: exercises.primaryMuscle,
      equipment: exercises.equipment,
    })
    .from(exercises)
    .orderBy(asc(exercises.movementPattern), asc(exercises.name));

  return rows
    .map((r) => `${r.name} [${r.pattern}, ${r.muscle}, ${r.equipment}]`)
    .join("\n");
}

async function generate(request: string): Promise<GeneratedProgram> {
  const client = new Anthropic();
  const catalogue = await catalogueText();

  const stream = client.messages.stream({
    model: MODEL,
    // Long blocks are genuinely large: a 16-week wave-loaded program with
    // four training days is thousands of prescribed sets. 32k truncated the
    // Juggernaut Method mid-cycle.
    max_tokens: 64000,
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        // The catalogue is identical across runs, so cache it — every program
        // generated after the first reads it back at a tenth of the price.
        text: `Exercise catalogue (use these names exactly):\n\n${catalogue}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { format: { type: "json_schema", schema: generatedProgramJsonSchema() } },
    messages: [
      {
        role: "user",
        content: `Reconstruct this training program: ${request}

Give the full block, week by week and day by day, with every exercise, set, and rep scheme.`,
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`model declined: ${message.stop_details?.explanation ?? "no explanation"}`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("output hit max_tokens — the program was cut off, raise the limit and retry");
  }

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");

  return generatedProgramSchema.parse(JSON.parse(text.text));
}

type ResolvedRow = { resolved: ResolvedExercise; where: string };

async function resolveAll(program: GeneratedProgram) {
  const resolutions = new Map<string, ResolvedRow>();
  const failures: string[] = [];

  for (const week of program.weeks_detail) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (resolutions.has(ex.exerciseName)) continue;
        const where = `week ${week.weekNumber} / ${day.name}`;
        const resolved = await resolveExerciseName(ex.exerciseName);
        if (!resolved) {
          failures.push(`  "${ex.exerciseName}" (${where})`);
          continue;
        }
        resolutions.set(ex.exerciseName, { resolved, where });
      }
    }
  }

  return { resolutions, failures };
}

async function main() {
  const args = process.argv.slice(2);
  const request = args.find((a) => !a.startsWith("--"));
  if (!request) usage();

  const dryRun = args.includes("--dry-run");
  const slugFlag = args[args.indexOf("--slug") + 1];

  console.log(`generating: ${request}`);
  const program = await generate(request);
  console.log(
    `  ${program.title} by ${program.authorName} — ${program.daysPerWeek}d/week, ${program.weeks} weeks`,
  );

  // The model occasionally returns a well-formed program with an empty
  // weeks_detail (schema allows it — nothing forces a non-empty array). That
  // parses fine and would otherwise save silently as a program with no
  // training data in it.
  const totalPrescribed = program.weeks_detail.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  ).length;
  if (program.weeks_detail.length === 0 || totalPrescribed === 0) {
    console.error(
      `\ngeneration produced no training data (${program.weeks_detail.length} weeks, ${totalPrescribed} prescribed sets) — retry the command`,
    );
    await sql.end();
    process.exit(1);
  }

  const { resolutions, failures } = await resolveAll(program);

  for (const [requested, { resolved }] of resolutions) {
    if (resolved.via === "exact") continue;
    const detail =
      resolved.via === "similarity"
        ? `similarity ${resolved.similarity!.toFixed(3)}`
        : "alias";
    console.log(`  matched "${requested}" -> ${resolved.name} (${detail})`);
  }

  if (failures.length > 0) {
    console.error(
      `\nrefusing to save: ${failures.length} exercise(s) are not in the catalogue:\n${failures.join("\n")}\n\nAdd them to src/data/exercises.ts and re-run the seed, or regenerate.`,
    );
    await sql.end();
    process.exit(1);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written");
    console.log(program.confidenceNotes);
    await sql.end();
    return;
  }

  const slug = slugFlag && !slugFlag.startsWith("--") ? slugFlag : slugify(program.title);

  // Equipment required is derived from what the program actually prescribes,
  // so the recommender's "does my gym have this?" filter can trust it.
  const usedIds = [...resolutions.values()].map((r) => r.resolved.id);
  const equipmentRows = await db
    .select({ equipment: exercises.equipment })
    .from(exercises)
    .where(inArray(exercises.id, usedIds));
  const equipmentRequired = [...new Set(equipmentRows.map((r) => r.equipment))];

  // Null when no embedding provider is configured. The program still saves;
  // `npm run backfill:embeddings` fills these in once a key exists.
  const embedding = await tryEmbedOne(
    [
      program.title,
      program.authorName,
      program.summary,
      program.splitType,
      `${program.goal} ${program.experienceLevel} ${program.daysPerWeek} days per week`,
      program.tags.join(", "),
    ].join(". "),
  );

  await db.transaction(async (tx) => {
    // Idempotent: re-running with the same slug replaces the program. Cascades
    // clear its weeks/days/exercises; user forks are untouched by design.
    await tx.delete(programs).where(eq(programs.slug, slug));

    const [saved] = await tx
      .insert(programs)
      .values({
        slug,
        title: program.title,
        authorName: program.authorName,
        sourceUrls: program.sourceUrls,
        summary: program.summary,
        description: `${program.description}\n\n---\n\n**Reconstruction notes:** ${program.confidenceNotes}`,
        goal: program.goal,
        experienceLevel: program.experienceLevel,
        daysPerWeek: program.daysPerWeek,
        weeks: program.weeks,
        splitType: program.splitType,
        progression: program.progression,
        equipmentRequired,
        tags: program.tags,
        aiGenerated: true,
        verified: false,
        generatedModel: MODEL,
        generatedAt: new Date(),
        embedding,
      })
      .returning({ id: programs.id });

    for (const week of program.weeks_detail) {
      const [savedWeek] = await tx
        .insert(programWeeks)
        .values({
          programId: saved.id,
          weekNumber: week.weekNumber,
          label: week.label,
          notes: week.notes,
          repeatCount: Math.max(1, week.repeatCount),
        })
        .returning({ id: programWeeks.id });

      for (const day of week.days) {
        const [savedDay] = await tx
          .insert(programDays)
          .values({
            weekId: savedWeek.id,
            dayIndex: day.dayIndex,
            name: day.name,
            notes: day.notes,
          })
          .returning({ id: programDays.id });

        await tx.insert(programExercises).values(
          day.exercises.map((ex, i) => ({
            dayId: savedDay.id,
            exerciseId: resolutions.get(ex.exerciseName)!.resolved.id,
            order: i,
            sets: ex.sets,
            reps: ex.reps,
            intensityType: ex.intensityType,
            intensityValue: ex.intensityValue,
            tempo: ex.tempo,
            restSeconds: ex.restSeconds,
            notes: ex.notes,
            supersetGroup: ex.supersetGroup,
          })),
        );
      }
    }
  });

  const totalExercises = program.weeks_detail.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  ).length;
  console.log(
    `\nsaved /programs/${slug} — ${program.weeks_detail.length} template week(s), ${totalExercises} prescribed sets`,
  );
  console.log("marked ai_generated, unverified. Review it before flipping verified.");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
