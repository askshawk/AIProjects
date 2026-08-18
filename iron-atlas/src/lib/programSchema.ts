import { z } from "zod";

/**
 * The shape the model must return. Deliberately flat and constraint-free:
 * the Anthropic structured-outputs schema subset rejects things like
 * `minLength` and `minimum`, so range checks happen in the resolver instead.
 */

const exerciseSchema = z.object({
  exerciseName: z
    .string()
    .describe(
      "Exact name from the provided exercise catalogue. Do not invent movements.",
    ),
  sets: z.number().int().describe("Number of working sets."),
  reps: z
    .string()
    .describe('Rep prescription as written, e.g. "8-12", "5", "AMRAP", "5/3/1+".'),
  intensityType: z
    .enum(["rpe", "rir", "percent_1rm", "weight", "bodyweight", "none"])
    .describe("How load is prescribed. Use 'none' if the source doesn't specify."),
  intensityValue: z
    .string()
    .nullable()
    .describe('The intensity, e.g. "8" for RPE 8, "75" for 75% of 1RM.'),
  tempo: z.string().nullable().describe('Tempo notation, e.g. "3010". Null if unspecified.'),
  restSeconds: z.number().int().nullable().describe("Rest between sets in seconds."),
  notes: z.string().nullable().describe("Coaching cue or technique note, one sentence."),
  supersetGroup: z
    .string()
    .nullable()
    .describe("Same letter for exercises performed as a superset, e.g. 'A'. Null if straight sets."),
});

const daySchema = z.object({
  dayIndex: z.number().int().describe("0-based order within the week."),
  name: z.string().describe('Training day name, e.g. "Push A", "Lower Body", "Deadlift Day".'),
  notes: z.string().nullable(),
  exercises: z.array(exerciseSchema),
});

const weekSchema = z.object({
  weekNumber: z.number().int().describe("1-based week number."),
  label: z.string().nullable().describe('e.g. "Wave 1 - 5s week", "Deload".'),
  notes: z.string().nullable(),
  repeatCount: z
    .number()
    .int()
    .describe(
      "How many calendar weeks this template week covers. Use the total week count when every week is identical.",
    ),
  days: z.array(daySchema),
});

export const generatedProgramSchema = z.object({
  title: z.string().describe("The program's commonly used name."),
  authorName: z.string().describe("The lifter or coach it is attributed to."),
  summary: z.string().describe("One or two sentences: who this is for and what it does."),
  description: z
    .string()
    .describe(
      "Two to four paragraphs on the training philosophy, how to run it, and how to progress.",
    ),
  goal: z.enum([
    "hypertrophy",
    "strength",
    "powerbuilding",
    "fat_loss",
    "athletic",
    "general_fitness",
  ]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  daysPerWeek: z.number().int(),
  weeks: z.number().int().describe("Total length of the block in calendar weeks."),
  splitType: z.string().describe('e.g. "push/pull/legs", "upper/lower", "full body", "bro split".'),
  progression: z.enum([
    "linear",
    "double_progression",
    "wave_531",
    "rpe_autoregulated",
    "percentage_block",
    "none",
  ]),
  tags: z.array(z.string()).describe("Short lowercase tags, e.g. 'high volume', 'classic'."),
  sourceUrls: z
    .array(z.string())
    .describe(
      "URLs where the real program is published. Only include URLs you are confident exist.",
    ),
  confidenceNotes: z
    .string()
    .describe(
      "State plainly which parts you are confident about and which you are reconstructing from general knowledge of the author's style.",
    ),
  weeks_detail: z.array(weekSchema).describe("The actual training weeks."),
});

export type GeneratedProgram = z.infer<typeof generatedProgramSchema>;

/**
 * Anthropic's structured-outputs schema subset rejects numeric and string
 * constraints. Zod emits them anyway — `z.number().int()` carries safe-integer
 * `minimum`/`maximum` — so strip them here. Zod's own validation still runs on
 * the parsed result, so nothing is actually unchecked.
 */
const UNSUPPORTED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "$schema",
];

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node === null || typeof node !== "object") return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.includes(key)) continue;
    out[key] = stripUnsupported(value);
  }
  return out;
}

export function generatedProgramJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(generatedProgramSchema, { io: "output", target: "draft-7" });
  return stripUnsupported(schema) as Record<string, unknown>;
}
