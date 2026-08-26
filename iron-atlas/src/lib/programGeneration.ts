import Anthropic from "@anthropic-ai/sdk";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";
import { slugify } from "@/data/parseExercises";
import { tryEmbedOne } from "@/lib/embeddings";
import {
  resolveExerciseName,
  type ResolvedExercise,
} from "@/lib/exerciseResolver";
import {
  generatedProgramJsonSchema,
  generatedProgramSchema,
  type GeneratedProgram,
} from "@/lib/programSchema";

/**
 * Reconstructs a well-known training program into the library schema.
 *
 * The model proposes structure; the exercise catalogue decides what's valid.
 * Every prescribed movement is resolved against `exercises` before anything is
 * written, and an unresolvable name rejects the whole program rather than
 * silently inventing a row.
 *
 * Failures are *returned*, not thrown or exited on — a batch of seventy
 * programs must be able to step over a bad one and keep going.
 */

export const DEFAULT_MODEL = "claude-sonnet-5";

/**
 * Long blocks are genuinely large: a 16-week wave-loaded program with four
 * training days is thousands of prescribed sets. 32k truncated the Juggernaut
 * Method mid-cycle. Truncated output is billed in full, so this is set high
 * enough that a retry is rarely the answer.
 */
const MAX_TOKENS = 64000;

const SYSTEM = `You are a strength-training librarian. You reconstruct well-known lifting programs into a structured format for a training app.

Accuracy rules, in order of importance:
1. Only prescribe exercises from the catalogue you are given, using the exact catalogue name. If a program calls for a movement that isn't in the catalogue, choose the closest catalogue entry and say so in confidenceNotes.
2. Never present a guess as fact. In confidenceNotes, state plainly which parts of the program you are confident about and which you are reconstructing from the author's general style.
3. Preserve what makes the program distinctive — its set/rep schemes, exercise order, intensity prescriptions, and progression rules. A generic program under a famous name is worse than no program.
4. If weeks differ (wave loading, 5/3/1 cycles), produce a week per variation. If every week is identical, produce one week with repeatCount set to the block length.
5. Only include sourceUrls you are confident actually exist. An empty array is better than a fabricated link.

Completeness matters as much as accuracy. Collapse weeks under rule 4 ONLY when they are genuinely identical — same exercises, same sets, same reps, same intensities. A program that rotates exercises between sessions (DoggCrapp), waves intensity (5/3/1, Juggernaut), or changes phase (Reg Park, Bromley) must have every distinct week and every rotation written out in full. Emitting one representative week for a program that actually varies makes it unusable. Likewise give every training day its complete exercise list, including assistance and isolation work — not just the main lifts.`;

/** Why a generation attempt produced nothing usable. */
export type FailureKind =
  /** Nondeterministic — the same request often succeeds on retry. */
  | "empty"
  /** Output ran past the token ceiling. Retrying rarely helps; scope does. */
  | "truncated"
  /** The model declined the request. */
  | "refused"
  /** Prescribed movements that aren't in the catalogue. */
  | "unresolved"
  /** Network, auth, billing, schema-parse. */
  | "error";

export type GenerationFailure = {
  ok: false;
  kind: FailureKind;
  message: string;
  /** Populated for `unresolved` — the catalogue gaps this program needs. */
  missing?: string[];
};

export type GenerationSuccess = {
  ok: true;
  slug: string;
  title: string;
  authorName: string;
  weeks: number;
  prescribedSets: number;
  /** Non-exact catalogue matches, worth eyeballing on review. */
  fuzzyMatches: { requested: string; matched: string; via: string }[];
  /** True when --dry-run kept it out of the database. */
  dryRun: boolean;
};

export type GenerationResult = GenerationSuccess | GenerationFailure;

/** `empty` is worth another attempt; nothing else is. */
export function isRetryable(kind: FailureKind): boolean {
  return kind === "empty";
}

let catalogueCache: string | undefined;

async function catalogueText(): Promise<string> {
  if (catalogueCache) return catalogueCache;
  const rows = await db
    .select({
      name: exercises.name,
      pattern: exercises.movementPattern,
      muscle: exercises.primaryMuscle,
      equipment: exercises.equipment,
    })
    .from(exercises)
    .orderBy(asc(exercises.movementPattern), asc(exercises.name));

  catalogueCache = rows
    .map((r) => `${r.name} [${r.pattern}, ${r.muscle}, ${r.equipment}]`)
    .join("\n");
  return catalogueCache;
}

async function generate(
  request: string,
  model: string,
): Promise<GeneratedProgram> {
  const client = new Anthropic();
  const catalogue = await catalogueText();

  const stream = client.messages.stream({
    model,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        // The catalogue is identical across runs, so cache it — every program
        // generated after the first reads it back at a tenth of the price.
        // This matters most in a batch, which is exactly when it pays off.
        text: `Exercise catalogue (use these names exactly):\n\n${catalogue}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: generatedProgramJsonSchema() },
    },
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
    throw Object.assign(
      new Error(
        `model declined: ${message.stop_details?.explanation ?? "no explanation"}`,
      ),
      { kind: "refused" as const },
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw Object.assign(
      new Error(
        `output hit max_tokens (${MAX_TOKENS}) — the program was cut off`,
      ),
      { kind: "truncated" as const },
    );
  }

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text")
    throw new Error("no text block in response");

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
          failures.push(ex.exerciseName);
          continue;
        }
        resolutions.set(ex.exerciseName, { resolved, where });
      }
    }
  }

  return { resolutions, failures };
}

export type GenerateOptions = {
  slug?: string;
  model?: string;
  dryRun?: boolean;
  /** Receives progress lines; defaults to silence so callers choose the format. */
  onProgress?: (line: string) => void;
};

export async function generateAndSave(
  request: string,
  options: GenerateOptions = {},
): Promise<GenerationResult> {
  const {
    slug: slugFlag,
    model = DEFAULT_MODEL,
    dryRun = false,
    onProgress,
  } = options;
  const say = onProgress ?? (() => {});

  let program: GeneratedProgram;
  try {
    program = await generate(request, model);
  } catch (err) {
    const kind = (err as { kind?: FailureKind }).kind ?? "error";
    return {
      ok: false,
      kind,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  say(
    `${program.title} by ${program.authorName} — ${program.daysPerWeek}d/week, ${program.weeks} weeks`,
  );

  // The model occasionally returns a well-formed program with an empty
  // weeks_detail (the schema allows it — nothing forces a non-empty array).
  // That parses fine and would otherwise save as a program with no training
  // data in it. Both Juggernaut and PHAT hit this and succeeded on retry.
  const prescribedSets = program.weeks_detail.flatMap((w) =>
    w.days.flatMap((d) => d.exercises),
  ).length;
  if (program.weeks_detail.length === 0 || prescribedSets === 0) {
    return {
      ok: false,
      kind: "empty",
      message: `no training data (${program.weeks_detail.length} weeks, ${prescribedSets} prescribed sets)`,
    };
  }

  const { resolutions, failures } = await resolveAll(program);

  const fuzzyMatches = [...resolutions.entries()]
    .filter(([, r]) => r.resolved.via !== "exact")
    .map(([requested, { resolved }]) => ({
      requested,
      matched: resolved.name,
      via:
        resolved.via === "similarity"
          ? `similarity ${resolved.similarity!.toFixed(3)}`
          : "alias",
    }));

  for (const m of fuzzyMatches)
    say(`matched "${m.requested}" -> ${m.matched} (${m.via})`);

  if (failures.length > 0) {
    return {
      ok: false,
      kind: "unresolved",
      message: `${failures.length} exercise(s) not in the catalogue`,
      missing: failures,
    };
  }

  const slug = slugFlag ?? slugify(program.title);

  if (dryRun) {
    say(program.confidenceNotes);
    return {
      ok: true,
      slug,
      title: program.title,
      authorName: program.authorName,
      weeks: program.weeks_detail.length,
      prescribedSets,
      fuzzyMatches,
      dryRun: true,
    };
  }

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

  try {
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
          generatedModel: model,
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

          // A day can legitimately carry no exercises — a rest day the model
          // wrote out as a day. Keep the row (the training view should show
          // "Rest"), but Drizzle throws on .values([]), so skip the insert.
          if (day.exercises.length === 0) continue;

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
  } catch (err) {
    // Generation already returns typed failures; the save has to as well, or
    // one malformed program aborts a batch of seventy. This is exactly how a
    // day with zero exercises took down a whole run.
    return {
      ok: false,
      kind: "error",
      message: `saving "${slug}" failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    slug,
    title: program.title,
    authorName: program.authorName,
    weeks: program.weeks_detail.length,
    prescribedSets,
    fuzzyMatches,
    dryRun: false,
  };
}
