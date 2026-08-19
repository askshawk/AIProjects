import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import {
  equipment as equipmentEnum,
  experienceLevel as levelEnum,
  goal as goalEnum,
} from "@/db/schema";
import { recommendPrograms } from "@/lib/recommend";

/** Embeddings and the pg driver are Node-only. */
export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are a knowledgeable strength coach helping someone pick a training program from a curated library.

How to run the conversation:
- Open by asking what they want out of training and how they like to train. Keep it conversational, not a form.
- You need four things before recommending: their goal, roughly how many days a week they can train, their experience level, and what equipment they have. Ask for what's missing, a couple of things at a time — never one question per message.
- Read between the lines. "I want to look better" is hypertrophy. "I've been lifting a couple of years and can squat my bodyweight" is intermediate. Don't interrogate someone about a detail you can reasonably infer, but don't invent facts they didn't give you.
- Once you have enough, call recommendPrograms. Do not guess at programs from memory — the tool is the only source of what's actually in the library.

How to present results:
- Lead with one recommendation, not a list. Say which program, whose it is, and why it fits what they told you.
- Mention the runners-up in a sentence, and say what would make each a better pick instead.
- Be specific about the training, not just the metadata: what the week actually looks like, what makes it distinctive.
- If a program is marked aiGenerated and not verified, say plainly that it's an AI reconstruction of the author's work and the details are worth checking against the source. Don't bury this.
- If the tool returns an empty "matched" array, the hard filters found nothing and these are loose semantic matches. Say so rather than claiming it fits their constraints.
- Never invent a program that isn't in the tool results.

Keep responses tight. Two or three short paragraphs, no headers, no bullet-point walls.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: anthropic("claude-opus-5"),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    // Let the model call the tool and then write its answer in the same turn.
    stopWhen: stepCountIs(4),
    tools: {
      recommendPrograms: tool({
        description:
          "Search the program library for the best fits given a lifter's profile. Call this once you know their goal, weekly availability, experience, and equipment. Returns real programs from the database — never recommend anything not in the result.",
        inputSchema: z.object({
          goal: z
            .enum(goalEnum.enumValues)
            .optional()
            .describe("What they're training for."),
          experienceLevel: z
            .enum(levelEnum.enumValues)
            .optional()
            .describe("Roughly how experienced they are."),
          daysPerWeek: z
            .number()
            .int()
            .optional()
            .describe("How many days a week they can train."),
          availableEquipment: z
            .array(z.enum(equipmentEnum.enumValues))
            .optional()
            .describe(
              "Everything they have access to. A full commercial gym is barbell, dumbbell, machine, cable, smith, bodyweight.",
            ),
          preferences: z
            .string()
            .optional()
            .describe(
              "Their own words about how they like to train — volume, favourite lifts, what they've enjoyed or hated before. This drives the semantic half of the search.",
            ),
        }),
        execute: async (profile) => recommendPrograms(profile),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
