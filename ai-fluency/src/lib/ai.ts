import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { and, gte, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { addDays, dayKey } from "./time";

/**
 * Every Claude call in the app goes through callClaude(), which:
 * - refuses when AI is switched off or the daily/monthly caps are reached,
 * - claims the call against the daily cap *before* calling, so a request that
 *   fails halfway still counts,
 * - asks for structured output validated against a zod schema,
 * - opts into Anthropic's server-side fallback, so a rare safety decline is
 *   retried on another model instead of failing the feature,
 * - records the estimated cost afterwards.
 */

export const MODEL = "claude-opus-5-5";

/** List price per million tokens, only used to estimate spend against the budget. */
const PRICE = { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2 };

export const DEFAULT_MONTHLY_BUDGET_USD = 20;
export const DEFAULT_DAILY_CALL_CAP = 150;

function numberEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class AiUnavailableError extends Error {}

export function aiStatus(): { available: true } | { available: false; reason: string } {
  if (process.env.AI_DISABLED === "1") return { available: false, reason: "AI features are switched off (AI_DISABLED)." };
  if (!process.env.ANTHROPIC_API_KEY) return { available: false, reason: "ANTHROPIC_API_KEY isn't set, so AI features are off." };
  return { available: true };
}

export function estimateCostUsd(usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null }) {
  return (
    (usage.input_tokens / 1e6) * PRICE.inputPerM +
    (usage.output_tokens / 1e6) * PRICE.outputPerM +
    ((usage.cache_read_input_tokens ?? 0) / 1e6) * PRICE.cacheReadPerM
  );
}

/** Estimated spend so far this calendar month (in your time zone). */
export async function monthSpendUsd(now = new Date()): Promise<number> {
  const today = dayKey(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float` })
    .from(aiUsage)
    .where(and(gte(aiUsage.day, monthStart), lt(aiUsage.day, nextMonth)));
  return row.total;
}

async function claimCall(): Promise<void> {
  const status = aiStatus();
  if (!status.available) throw new AiUnavailableError(status.reason);

  const budget = numberEnv("AI_MONTHLY_BUDGET_USD", DEFAULT_MONTHLY_BUDGET_USD);
  if ((await monthSpendUsd()) >= budget) {
    throw new AiUnavailableError(
      `This month's AI budget ($${budget}) is used up. AI features come back on the 1st; everything else still works.`,
    );
  }

  const cap = numberEnv("AI_DAILY_CALL_CAP", DEFAULT_DAILY_CALL_CAP);
  const day = dayKey(new Date());
  // Atomic check-and-increment: the update only applies while under the cap.
  const rows = await db
    .insert(aiUsage)
    .values({ day, calls: 1 })
    .onConflictDoUpdate({
      target: aiUsage.day,
      set: { calls: sql`${aiUsage.calls} + 1` },
      setWhere: sql`${aiUsage.calls} < ${cap}`,
    })
    .returning({ calls: aiUsage.calls });
  if (rows.length === 0) throw new AiUnavailableError(`You've hit today's limit of ${cap} AI calls. It resets at midnight.`);
}

async function recordCost(cost: number) {
  await db
    .update(aiUsage)
    .set({ costUsd: sql`${aiUsage.costUsd} + ${cost}` })
    .where(sql`${aiUsage.day} = ${dayKey(new Date())}`);
}

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export type ClaudeRequest<T extends z.ZodType> = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: T;
  /** low for quick grading and chat turns; medium for extraction. */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
};

export async function callClaude<T extends z.ZodType>(req: ClaudeRequest<T>): Promise<z.infer<T>> {
  await claimCall();

  let response;
  try {
    response = await getClient().beta.messages.parse({
      model: MODEL,
      max_tokens: req.maxTokens ?? 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // The system prompt is stable per feature, so cache it.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: req.messages,
      output_config: { effort: req.effort ?? "low", format: zodOutputFormat(req.schema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new AiUnavailableError("Claude is busy right now. Try again in a minute.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiUnavailableError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new AiUnavailableError(`Claude returned an error (${error.status}). Try again.`);
    }
    if (error instanceof Anthropic.AnthropicError) {
      // The SDK validates the answer against the schema; a rare mismatch lands here.
      throw new AiUnavailableError("Claude's answer didn't come back in the expected shape. Try again.");
    }
    throw new AiUnavailableError("Couldn't reach Claude. Check the connection and try again.");
  }

  await recordCost(estimateCostUsd(response.usage));

  if (response.stop_reason === "refusal") {
    throw new AiUnavailableError("Claude declined that request. Try rephrasing it.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AiUnavailableError("Claude's answer came back incomplete. Try again.");
  }
  return response.parsed_output as z.infer<T>;
}

/** For server actions: turn AI errors into a message the page can show. */
export async function tryAi<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
