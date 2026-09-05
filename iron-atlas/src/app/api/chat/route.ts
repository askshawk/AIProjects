import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
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
import {
  claimDailyMessage,
  DAILY_MESSAGE_CAP,
  estimateCostUsd,
  MONTHLY_BUDGET_USD,
  monthlySpendUsd,
  recordSpend,
} from "@/lib/chatLimits";

/** Embeddings and the pg driver are Node-only. */
export const runtime = "nodejs";
export const maxDuration = 60;

/** Panic switch — set in the host env to take the coach offline instantly. */
const COACH_DISABLED = process.env.COACH_DISABLED === "1";

/**
 * Hard ceiling on the request body. Generous for a real conversation (a long
 * coaching thread is a few KB) and far below the point where input-token cost
 * becomes the dominant spend.
 */
const MAX_BODY_BYTES = 64 * 1024;
/** A thread longer than this is not a coaching conversation. */
const MAX_MESSAGES = 40;
/** Per text part, so one message can't carry the whole budget on its own. */
const MAX_PART_CHARS = 4000;
/** Also the ceiling used for the up-front spend estimate below. */
const MAX_OUTPUT_TOKENS = 800;

/**
 * Only what convertToModelMessages actually needs. Roles are restricted to
 * user/assistant so a caller can't forge system turns, and every length is
 * bounded — this schema is a spend guard as much as a correctness one.
 */
const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        id: z.string().max(200).optional(),
        role: z.enum(["user", "assistant"]),
        parts: z
          .array(
            z
              .object({ type: z.string().max(50) })
              .catchall(z.unknown())
              .refine(
                (p) =>
                  typeof p.text !== "string" || p.text.length <= MAX_PART_CHARS,
                { message: "part text too long" },
              ),
          )
          .max(50),
      }),
    )
    .max(MAX_MESSAGES),
});

const OPUS = "claude-opus-5";
const SONNET = "claude-sonnet-5";

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
  if (COACH_DISABLED) {
    return new Response("The coach is temporarily unavailable.", {
      status: 503,
    });
  }

  // Size caps come before parsing. Input tokens are billed per request, so an
  // oversized body is a direct spend multiplier: ~700KB of JSON is ~180k input
  // tokens (~$0.54) against the ~$0.002 a real coach message costs. The daily
  // message cap was sized for real messages, so without this one account's
  // 40 messages could spend the entire monthly budget.
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return new Response("That message is too long — try a shorter one.", {
      status: 413,
    });
  }

  let messages: UIMessage[];
  try {
    const raw = await req.text();
    // content-length is client-supplied, so re-check against what actually
    // arrived rather than trusting the header.
    if (raw.length > MAX_BODY_BYTES) {
      return new Response("That message is too long — try a shorter one.", {
        status: 413,
      });
    }
    // Validated as a shape, not just "is an array" — a malformed-but-valid
    // JSON body used to pass the array check and then throw inside
    // convertToModelMessages as an unhandled 500.
    const body = requestSchema.parse(JSON.parse(raw));
    messages = body.messages as UIMessage[];
  } catch {
    return new Response("Couldn't read that message — try sending it again.", {
      status: 400,
    });
  }

  // Resolved once per request, from the session cookie — never from anything
  // the model or the client can influence. A tweak tool can only ever reach
  // the signed-in lifter's own active fork.
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Sign in to talk to the coach.", { status: 401 });
  }

  // The owner's own account is exempt from the spend guards below — the
  // point of the caps is to stop a stranger from running up Alan's bill, not
  // to stop Alan from using his own product.
  if (!user.isAdmin) {
    const spent = await monthlySpendUsd();
    if (spent >= MONTHLY_BUDGET_USD) {
      return new Response(
        "The coach has hit its budget for this month — try again next month.",
        { status: 429 },
      );
    }

    const claimed = await claimDailyMessage(user.id);
    if (!claimed) {
      return new Response(
        `You've hit today's limit of ${DAILY_MESSAGE_CAP} coach messages — try again tomorrow.`,
        { status: 429 },
      );
    }
  }

  const model = user.isAdmin ? OPUS : SONNET;

  /**
   * Charged *before* the model is called, then reconciled to the real figure
   * in onFinish.
   *
   * Recording spend only on completion left two holes: a client that
   * disconnects mid-stream cancels it, so onFinish never fired even though
   * Anthropic had already billed the input — the monthly budget could sit at
   * $0.00 while real money left the account. And because the budget check is
   * a plain SUM, concurrent requests all read the same pre-spend total and
   * all passed. Charging up front closes the first completely and narrows the
   * second, since in-flight requests are now visible to each other's check.
   * Erring high is the safe direction: an abandoned request stays
   * over-charged rather than free.
   */
  const approxInputTokens = Math.ceil(
    (SYSTEM.length + JSON.stringify(messages).length) / 4,
  );
  const upfrontEstimate = estimateCostUsd(
    model,
    approxInputTokens,
    MAX_OUTPUT_TOKENS,
  );
  try {
    await recordSpend(user.id, upfrontEstimate);
  } catch (err) {
    console.error("failed to pre-charge coach spend:", err);
  }

  // Plain number, not a property on the nullable `user` — TypeScript can't
  // see across the closure below that `user` was already checked, but it can
  // see that this was.
  const userId = user.id;
  const gym = await readGymProfile();

  /**
   * Runs a fork mutation, or explains why it can't. Returning a reason rather
   * than throwing lets the model tell the lifter what to do about it — start
   * a program first, in this case; sign-in is already required to reach here.
   */
  async function withActiveProgram<T>(
    fn: (fork: { id: number }, userId: number) => Promise<T>,
  ): Promise<T | { ok: false; reason: string }> {
    const fork = await activeProgram(userId);
    if (!fork)
      return { ok: false, reason: "the lifter hasn't started a program yet" };
    try {
      return await fn(fork, userId);
    } catch (err) {
      console.error("chat tool call failed:", err);
      return { ok: false, reason: "something went wrong updating the program — try again" };
    }
  }

  const result = streamText({
    model: anthropic(model),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    // Let the model call the tool and then write its answer in the same turn.
    stopWhen: stepCountIs(4),
    // A capped response keeps a single reply from blowing past what a
    // strength-coaching answer should ever need.
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onFinish: async ({ usage }) => {
      const actual = estimateCostUsd(
        model,
        usage.inputTokens ?? 0,
        usage.outputTokens ?? 0,
      );
      // Only the difference — the up-front estimate is already on the ledger,
      // so this settles it to the real figure and is usually negative.
      try {
        await recordSpend(userId, actual - upfrontEstimate);
      } catch (err) {
        console.error("failed to reconcile coach spend:", err);
      }
    },
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
        execute: async (profile) => {
          try {
            return await recommendPrograms(profile);
          } catch (err) {
            console.error("recommendPrograms failed:", err);
            return { ok: false, reason: "the program search hit an error — try again" };
          }
        },
      }),

      suggestSwaps: tool({
        description:
          "Find gym-appropriate replacements for a movement in the lifter's active program. Read-only — call this before swapExercise when they say they can't do something, and let them pick from the result.",
        inputSchema: z.object({
          exerciseName: z
            .string()
            .describe("The movement they want to replace."),
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
            .describe(
              "Limit the change to this movement. Omit to change every exercise.",
            ),
          deltaSets: z
            .number()
            .int()
            .optional()
            .describe("Sets to add (negative to remove)."),
          multiplier: z
            .number()
            .positive()
            .optional()
            .describe("Scale sets by this factor."),
        }),
        execute: async (opts) =>
          withActiveProgram((fork, userId) =>
            adjustVolume(fork.id, userId, opts),
          ),
      }),

      addExercise: tool({
        description:
          "Add a movement to a training day in the lifter's active program.",
        inputSchema: z.object({
          dayName: z
            .string()
            .describe("Which day — matched loosely against the day names."),
          exerciseName: z.string(),
          sets: z.number().int().describe("Working sets."),
          reps: z.string().describe('Rep target, e.g. "8-12" or "AMRAP".'),
        }),
        execute: async (opts) =>
          withActiveProgram((fork, userId) =>
            addExercise(fork.id, userId, opts),
          ),
      }),

      removeExercise: tool({
        description:
          "Drop a movement from the lifter's active program entirely. Prefer swapExercise when they just can't perform it — removing loses the training the program intended.",
        inputSchema: z.object({ exerciseName: z.string() }),
        execute: async ({ exerciseName }) =>
          withActiveProgram((fork, userId) =>
            removeExercise(fork.id, userId, exerciseName),
          ),
      }),
    },
  });

  // Runs the stream to completion server-side even if the browser goes away
  // mid-response, so onFinish (and the spend reconciliation in it) still
  // fires. Deliberately not awaited — the response must start streaming now.
  void result.consumeStream();

  return result.toUIMessageStreamResponse();
}
