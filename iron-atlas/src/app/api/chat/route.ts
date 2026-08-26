import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import {
  equipment as equipmentEnum,
  experienceLevel as levelEnum,
  goal as goalEnum,
} from "@/db/schema";
import { recommendPrograms } from "@/lib/recommend";
import { getCurrentUser } from "@/lib/auth";
import { activeProgram } from "@/lib/fork";
import { readGymProfile } from "@/lib/gymProfile";
import {
  addExercise,
  adjustVolume,
  removeExercise,
  suggestSwaps,
  swapExercise,
} from "@/lib/tweak";

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

Changing a program they've already started:
- The tweak tools edit the lifter's own copy. The library original is never touched, so they can experiment freely — say so if they seem hesitant.
- When they can't perform a movement, call suggestSwaps first and offer the options. Don't pick for them unless they ask you to.
- Prefer swapping over removing. Dropping an exercise loses the training the program intended; a substitute keeps it.
- Report what actually changed, using the summary and diff the tool returns. Never claim an edit you didn't make, and if a tool comes back with ok:false, tell them the reason plainly instead of trying a different tool to work around it.
- Volume changes are capped at 1–20 sets per exercise. If a request would exceed that, say what you did instead.

Keep responses tight. Two or three short paragraphs, no headers, no bullet-point walls.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Resolved once per request, from the session cookie — never from anything
  // the model or the client can influence. A tweak tool can only ever reach
  // the signed-in lifter's own active fork.
  const user = await getCurrentUser();
  const gym = await readGymProfile();

  /**
   * Runs a fork mutation, or explains why it can't. Returning a reason rather
   * than throwing lets the model tell the lifter what to do about it — sign
   * in, or start a program first.
   */
  async function withActiveProgram<T>(
    fn: (fork: { id: number }, userId: number) => Promise<T>,
  ): Promise<T | { ok: false; reason: string }> {
    if (!user) return { ok: false, reason: "the lifter isn't signed in" };
    const fork = await activeProgram(user.id);
    if (!fork) return { ok: false, reason: "the lifter hasn't started a program yet" };
    return fn(fork, user.id);
  }

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

      suggestSwaps: tool({
        description:
          "Find gym-appropriate replacements for a movement in the lifter's active program. Read-only — call this before swapExercise when they say they can't do something, and let them pick from the result.",
        inputSchema: z.object({
          exerciseName: z.string().describe("The movement they want to replace."),
        }),
        execute: async ({ exerciseName }) =>
          withActiveProgram((fork, userId) =>
            suggestSwaps(fork.id, userId, exerciseName, gym),
          ),
      }),

      swapExercise: tool({
        description:
          "Replace one exercise with another everywhere it appears in the lifter's active program. Only use an exercise name that came back from suggestSwaps or that the lifter named themselves.",
        inputSchema: z.object({
          fromName: z.string().describe("The movement to replace."),
          toName: z.string().describe("What to replace it with."),
        }),
        execute: async ({ fromName, toName }) =>
          withActiveProgram((fork, userId) =>
            swapExercise(fork.id, userId, fromName, toName),
          ),
      }),

      adjustVolume: tool({
        description:
          "Change how many sets the lifter does — for one exercise, or across the whole program. Use deltaSets for 'add two sets', multiplier for 'halve my arm work'.",
        inputSchema: z.object({
          exerciseName: z
            .string()
            .optional()
            .describe("Limit the change to this movement. Omit to change every exercise."),
          deltaSets: z.number().int().optional().describe("Sets to add (negative to remove)."),
          multiplier: z.number().positive().optional().describe("Scale sets by this factor."),
        }),
        execute: async (opts) =>
          withActiveProgram((fork, userId) => adjustVolume(fork.id, userId, opts)),
      }),

      addExercise: tool({
        description:
          "Add a movement to a training day in the lifter's active program.",
        inputSchema: z.object({
          dayName: z.string().describe("Which day — matched loosely against the day names."),
          exerciseName: z.string(),
          sets: z.number().int().describe("Working sets."),
          reps: z.string().describe('Rep target, e.g. "8-12" or "AMRAP".'),
        }),
        execute: async (opts) =>
          withActiveProgram((fork, userId) => addExercise(fork.id, userId, opts)),
      }),

      removeExercise: tool({
        description:
          "Drop a movement from the lifter's active program entirely. Prefer swapExercise when they just can't perform it — removing loses the training the program intended.",
        inputSchema: z.object({ exerciseName: z.string() }),
        execute: async ({ exerciseName }) =>
          withActiveProgram((fork, userId) => removeExercise(fork.id, userId, exerciseName)),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
