import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { chatUsage, users } from "@/db/schema";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * This is the one route with real request-handling logic (auth gate, budget
 * and rate-limit branches, malformed-body handling) rather than a thin
 * wrapper over a tested lib function, and it had no coverage at all. The two
 * boundaries mocked below are the ones a test genuinely shouldn't cross:
 * `next/headers`'s `cookies()` needs a request scope this file never has
 * (same approach as auth.test.ts), and `ai`/`@ai-sdk/anthropic` would
 * otherwise make a real, billed network call on every test run. Everything
 * else — auth, the daily cap, the monthly budget — runs for real against the
 * local database, the same way chatLimits.test.ts does.
 */

const store = new Map<string, { value: string; options?: object }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => store.get(name),
    set: (name: string, value: string, options?: object) =>
      store.set(name, { value, options }),
    delete: (name: string) => store.delete(name),
  }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: (model: string) => ({ model }),
}));

vi.mock("ai", () => ({
  convertToModelMessages: async (messages: unknown) => messages,
  stepCountIs: (n: number) => n,
  tool: (config: unknown) => config,
  isToolUIPart: () => false,
  streamText: (opts: { onFinish?: (r: unknown) => unknown }) => ({
    toUIMessageStreamResponse: () => {
      // Mirrors the real SDK's contract closely enough for chatLimits'
      // recordSpend to actually run — onFinish fires once the stream (here,
      // immediately) completes, with the token usage the cost estimate reads.
      opts.onFinish?.({ usage: { inputTokens: 100, outputTokens: 50 } });
      return new Response("ok", { status: 200 });
    },
  }),
}));

process.env.COACH_DAILY_MESSAGE_CAP = "2";

const { POST } = await import("@/app/api/chat/route");
const { createSession, registerUser } = await import("@/lib/auth");

afterAll(async () => {
  await client.end();
});

beforeEach(() => {
  store.clear();
});

const createdUserIds: number[] = [];

afterEach(async () => {
  for (const id of createdUserIds.splice(0)) {
    await db.delete(chatUsage).where(eq(chatUsage.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});

async function signedInRequest(body: unknown) {
  const email = `test-chatroute-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const result = await registerUser(email, "correct-horse-battery");
  if (!result.ok) throw new Error(result.error);
  createdUserIds.push(result.userId);
  await createSession(result.userId);

  const cookie = store.get("iron-atlas-session");
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `iron-atlas-session=${cookie.value}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat — request validation", () => {
  it("returns 400 for a body that isn't valid JSON", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages is missing", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages isn't an array", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: "hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat — auth gate", () => {
  it("returns 401 for a well-formed request with no session", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/chat — happy path", () => {
  it("streams a response for a signed-in user under every cap", async () => {
    const req = await signedInRequest({ messages: [] });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/chat — daily message cap", () => {
  it("refuses once a signed-in user is past today's cap", async () => {
    const email = `test-chatroute-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
    const result = await registerUser(email, "correct-horse-battery");
    if (!result.ok) throw new Error(result.error);
    createdUserIds.push(result.userId);
    await createSession(result.userId);
    const cookie = store.get("iron-atlas-session")!;

    const makeReq = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `iron-atlas-session=${cookie.value}`,
        },
        body: JSON.stringify({ messages: [] }),
      });

    // Cap is 2 for this file (COACH_DAILY_MESSAGE_CAP set above).
    expect((await POST(makeReq())).status).toBe(200);
    expect((await POST(makeReq())).status).toBe(200);
    const third = await POST(makeReq());
    expect(third.status).toBe(429);
    expect(await third.text()).toMatch(/today's limit/i);
  });
});

describe("POST /api/chat — monthly budget", () => {
  it("refuses every non-admin request once the budget is exhausted", async () => {
    // A fresh module graph with COACH_MONTHLY_BUDGET_USD forced to 0 — real
    // spend recorded anywhere this month is always >= 0, so the budget
    // check is guaranteed to trip regardless of what other tests or runs
    // have already recorded, without needing to know or reset that total.
    vi.resetModules();
    process.env.COACH_MONTHLY_BUDGET_USD = "0";
    const { POST: postWithNoBudget } = await import("@/app/api/chat/route");
    const { registerUser: register2, createSession: createSession2 } =
      await import("@/lib/auth");

    const email = `test-chatroute-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
    const result = await register2(email, "correct-horse-battery");
    if (!result.ok) throw new Error(result.error);
    createdUserIds.push(result.userId);
    await createSession2(result.userId);
    const cookie = store.get("iron-atlas-session")!;

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `iron-atlas-session=${cookie.value}`,
      },
      body: JSON.stringify({ messages: [] }),
    });

    const res = await postWithNoBudget(req);
    expect(res.status).toBe(429);
    expect(await res.text()).toMatch(/budget/i);

    delete process.env.COACH_MONTHLY_BUDGET_USD;
  });
});

describe("POST /api/chat — panic switch", () => {
  it("returns 503 for every request when COACH_DISABLED=1", async () => {
    vi.resetModules();
    process.env.COACH_DISABLED = "1";
    const { POST: postDisabled } = await import("@/app/api/chat/route");

    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    const res = await postDisabled(req);
    expect(res.status).toBe(503);

    delete process.env.COACH_DISABLED;
  });
});
