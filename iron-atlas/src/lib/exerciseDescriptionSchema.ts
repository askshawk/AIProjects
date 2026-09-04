import { z } from "zod";
import { stripUnsupported } from "@/lib/programSchema";

/**
 * The shape the model returns for one batch of exercises — see
 * scripts/generate-exercise-descriptions.ts. One request describes several
 * exercises at once, both to keep the request count (and cost) down and
 * because the model writes more consistent cueing when it can see a batch of
 * related movements together rather than one in isolation.
 */

const exerciseDescriptionSchema = z.object({
  slug: z
    .string()
    .describe("Exact slug from the provided exercise list. Do not invent one."),
  description: z
    .string()
    .describe(
      "One short paragraph (2-4 sentences) on what the movement is and what it trains, " +
        "followed by 3-5 bullet-point form cues (each starting with '- '), separated by a " +
        "blank line. Plain, descriptive coaching language — how the movement is performed " +
        "and what good execution looks like. No medical, injury-treatment, or rehab claims, " +
        "and no claim that this is a substitute for professional instruction.",
    ),
});

export const batchDescriptionSchema = z.object({
  exercises: z.array(exerciseDescriptionSchema),
});

export type BatchDescriptions = z.infer<typeof batchDescriptionSchema>;

export function batchDescriptionJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(batchDescriptionSchema, {
    io: "output",
    target: "draft-7",
  });
  return stripUnsupported(schema) as Record<string, unknown>;
}
