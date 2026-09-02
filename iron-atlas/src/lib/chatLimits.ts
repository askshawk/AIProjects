import { and, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { chatUsage } from "@/db/schema";

/**
 * Anthropic's list price per million tokens, for the two models the coach can
 * be served on. Only used to estimate spend against COACH_MONTHLY_BUDGET_USD
 * — nothing here is billed against, so a stale number costs at most a
 * slightly-off guard, never a wrong invoice.
 */
const PRICING: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-opus-5": { inputPerM: 15, outputPerM: 75 },
  "claude-sonnet-5": { inputPerM: 3, outputPerM: 15 },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICING[model] ?? PRICING["claude-sonnet-5"];
  return (
    (inputTokens / 1_000_000) * price.inputPerM +
    (outputTokens / 1_000_000) * price.outputPerM
  );
}

/** How many coach messages a non-admin user can send per UTC day. */
export const DAILY_MESSAGE_CAP = Number(
  process.env.COACH_DAILY_MESSAGE_CAP ?? 40,
);

/** Total estimated spend across every user, per calendar month. */
export const MONTHLY_BUDGET_USD = Number(
  process.env.COACH_MONTHLY_BUDGET_USD ?? 20,
);

const todayUtc = () => new Date().toISOString().slice(0, 10);
const firstOfMonthUtc = () => `${new Date().toISOString().slice(0, 7)}-01`;

/**
 * Atomically claims one message against today's cap for this user.
 * Returns false if they're already at the cap.
 *
 * Increments *before* the model is called, so the cap holds even if a
 * request never finishes — a coach that fails after burning tokens still
 * counted against the sender. The `where` clause on the conflict update
 * makes the check-and-increment atomic: two concurrent requests can't both
 * slip through sitting at count 39.
 */
export async function claimDailyMessage(userId: number): Promise<boolean> {
  const day = todayUtc();
  const rows = await db
    .insert(chatUsage)
    .values({ userId, day, messageCount: 1 })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: { messageCount: sql`${chatUsage.messageCount} + 1` },
      setWhere: sql`${chatUsage.messageCount} < ${DAILY_MESSAGE_CAP}`,
    })
    .returning({ messageCount: chatUsage.messageCount });

  return rows.length > 0;
}

/** Adds actual spend for this user's message today, once the model has responded. */
export async function recordSpend(
  userId: number,
  costUsd: number,
): Promise<void> {
  const day = todayUtc();
  await db
    .insert(chatUsage)
    .values({ userId, day, messageCount: 0, estimatedCostUsd: String(costUsd) })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: {
        estimatedCostUsd: sql`${chatUsage.estimatedCostUsd} + ${costUsd}`,
      },
    });
}

/** Total estimated coach spend across every user so far this calendar month. */
export async function monthlySpendUsd(): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${chatUsage.estimatedCostUsd}), 0)` })
    .from(chatUsage)
    .where(and(gte(chatUsage.day, firstOfMonthUtc())));
  return Number(row?.total ?? 0);
}
