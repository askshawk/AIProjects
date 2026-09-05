import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { chatUsage, users } from "@/db/schema";

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

const { claimDailyMessage, recordSpend, monthlySpendUsd, estimateCostUsd } =
  await import("@/lib/chatLimits");

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
