import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { chatBudget, chatUsage, users } from "@/db/schema";

/**
 * Registration is rate-limited per caller, so every `makeUser` here has to
 * look like a different one — otherwise this file's test accounts exhaust a
 * single bucket and fail on the throttle rather than on anything it's testing.
 */
let sourceCounter = 0;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
  headers: async () => ({
    get: (name: string) =>
      name.toLowerCase() === "x-forwarded-for"
        ? `198.18.1.${sourceCounter++ % 250}`
        : null,
  }),
}));

const { registerUser } = await import("@/lib/auth");

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * The daily cap is the only thing standing between a public /coach endpoint
 * and an open tap on Anthropic spend, so the atomic claim-and-increment is
 * what actually matters here — not the happy path of "returns true once".
 *
 * COACH_DAILY_MESSAGE_CAP is read once at module load, so it's set before the
 * dynamic import rather than per-test — every test in this file shares a cap
 * of 3.
 */

process.env.COACH_DAILY_MESSAGE_CAP = "3";
process.env.COACH_MONTHLY_BUDGET_USD = "1";

const {
  claimBudget,
  claimDailyMessage,
  estimateCostUsd,
  monthlySpendUsd,
  recordSpend,
  releaseBudget,
} = await import("@/lib/chatLimits");

afterAll(async () => {
  await client.end();
});

async function makeUser() {
  const email = `test-chatlimits-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const result = await registerUser(email, "correct-horse-battery");
  if (!result.ok) throw new Error(result.error);
  return result.userId;
}

describe("estimateCostUsd", () => {
  it("prices Opus higher than Sonnet for the same tokens", () => {
    const opus = estimateCostUsd("claude-opus-5", 1_000_000, 1_000_000);
    const sonnet = estimateCostUsd("claude-sonnet-5", 1_000_000, 1_000_000);
    expect(opus).toBeGreaterThan(sonnet);
  });

  it("falls back to Sonnet pricing for an unrecognized model", () => {
    expect(estimateCostUsd("some-future-model", 1_000_000, 0)).toBe(
      estimateCostUsd("claude-sonnet-5", 1_000_000, 0),
    );
  });
});

describe("claimDailyMessage", () => {
  it("allows claims up to the cap, then refuses", async () => {
    const userId = await makeUser();
    try {
      expect(await claimDailyMessage(userId)).toBe(true);
      expect(await claimDailyMessage(userId)).toBe(true);
      expect(await claimDailyMessage(userId)).toBe(true);
      // Cap is 3 for this file — the fourth claim must be refused, not just
      // recorded past the limit.
      expect(await claimDailyMessage(userId)).toBe(false);
      expect(await claimDailyMessage(userId)).toBe(false);
    } finally {
      await db.delete(chatUsage).where(eq(chatUsage.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  it("keeps each user's count independent", async () => {
    const a = await makeUser();
    const b = await makeUser();
    try {
      expect(await claimDailyMessage(a)).toBe(true);
      expect(await claimDailyMessage(a)).toBe(true);
      expect(await claimDailyMessage(a)).toBe(true);
      expect(await claimDailyMessage(a)).toBe(false);
      // b's cap hasn't been touched by a's claims.
      expect(await claimDailyMessage(b)).toBe(true);
    } finally {
      await db.delete(chatUsage).where(eq(chatUsage.userId, a));
      await db.delete(chatUsage).where(eq(chatUsage.userId, b));
      await db.delete(users).where(eq(users.id, a));
      await db.delete(users).where(eq(users.id, b));
    }
  });
});

describe("recordSpend / monthlySpendUsd", () => {
  it("adds to what's already recorded rather than overwriting it", async () => {
    const userId = await makeUser();
    try {
      const before = await monthlySpendUsd();
      await recordSpend(userId, 1.5);
      await recordSpend(userId, 0.25);

      const [row] = await db
        .select({ cost: chatUsage.estimatedCostUsd })
        .from(chatUsage)
        .where(
          and(eq(chatUsage.userId, userId), eq(chatUsage.messageCount, 0)),
        );
      expect(Number(row!.cost)).toBeCloseTo(1.75, 4);

      const after = await monthlySpendUsd();
      expect(after).toBeCloseTo(before + 1.75, 4);
    } finally {
      await db.delete(chatUsage).where(eq(chatUsage.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });
});

/**
 * The budget is the last line between a public /coach endpoint and an
 * unbounded Anthropic bill, and the property that matters is *atomicity*.
 * The previous guard read a SUM and then decided in application code, so a
 * burst of concurrent requests all saw the same pre-spend total and all
 * passed. These tests fire claims concurrently on purpose.
 *
 * COACH_MONTHLY_BUDGET_USD is set to 1 above, before the dynamic import.
 */
describe("claimBudget / releaseBudget", () => {
  const month = new Date().toISOString().slice(0, 7);
  const reset = () => db.delete(chatBudget).where(eq(chatBudget.month, month));

  it("allows claims up to the budget, then refuses", async () => {
    await reset();
    try {
      expect(await claimBudget(0.4)).toBe(true);
      expect(await claimBudget(0.4)).toBe(true);
      // 0.8 + 0.4 would exceed the $1 budget.
      expect(await claimBudget(0.4)).toBe(false);
    } finally {
      await reset();
    }
  });

  it("does not let concurrent claims overshoot the budget", async () => {
    await reset();
    try {
      // Twenty simultaneous claims of $0.25 against a $1 budget. Exactly four
      // may succeed; the read-then-decide version let all twenty through.
      const results = await Promise.all(
        Array.from({ length: 20 }, () => claimBudget(0.25)),
      );
      expect(results.filter(Boolean)).toHaveLength(4);

      const [row] = await db
        .select({ spent: chatBudget.spentUsd })
        .from(chatBudget)
        .where(eq(chatBudget.month, month));
      expect(Number(row.spent)).toBeCloseTo(1, 4);
    } finally {
      await reset();
    }
  });

  it("gives budget back when a claim is settled downward", async () => {
    await reset();
    try {
      expect(await claimBudget(0.9)).toBe(true);
      expect(await claimBudget(0.9)).toBe(false);

      // The real cost came in far below the pessimistic estimate.
      await releaseBudget(-0.85);
      expect(await claimBudget(0.9)).toBe(true);
    } finally {
      await reset();
    }
  });

  it("never drives the running total below zero", async () => {
    await reset();
    try {
      await claimBudget(0.1);
      await releaseBudget(-5);
      const [row] = await db
        .select({ spent: chatBudget.spentUsd })
        .from(chatBudget)
        .where(eq(chatBudget.month, month));
      expect(Number(row.spent)).toBe(0);
    } finally {
      await reset();
    }
  });
});
