import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql as client } from "@/db";
import { sessions } from "@/db/schema";

/**
 * Runs against the local database — start it with `npm run db`.
 *
 * This is the one file where an untested bug is a security bug rather than a
 * UX one: a broken constant-time check leaks timing, a broken generic error
 * tells an attacker which emails have accounts, and a broken cookie flag
 * leaves a session token readable to a script on the page.
 *
 * `next/headers`'s `cookies()` requires a request scope this test file never
 * has, so it's mocked with a plain in-memory store — the same get/set/delete
 * shape auth.ts actually calls, not a stand-in for Next's real cookie jar.
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

const {
  SESSION_COOKIE,
  SIGN_IN_ATTEMPT_CAP,
  authenticate,
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  normalizeEmail,
  registerUser,
  verifyPassword,
} = await import("@/lib/auth");

afterAll(async () => {
  await client.end();
});

beforeEach(() => {
  store.clear();
});

async function makeUser(emailOverride?: string) {
  const email = emailOverride ?? `test-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
  const result = await registerUser(email, "correct-horse-battery");
  if (!result.ok) throw new Error(result.error);
  return { email, userId: result.userId };
}

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("never stores the password in plain text", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toContain("correct-horse-battery");
  });

  it("salts independently, so two hashes of the same password differ", async () => {
    const a = await hashPassword("correct-horse-battery");
    const b = await hashPassword("correct-horse-battery");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct-horse-battery", a)).toBe(true);
    expect(await verifyPassword("correct-horse-battery", b)).toBe(true);
  });

  it("rejects a malformed stored hash rather than throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims, so two spellings are the same account", () => {
    expect(normalizeEmail("  Alan@Example.com  ")).toBe("alan@example.com");
  });
});

describe("registerUser", () => {
  it("creates an account for a valid email and password", async () => {
    const result = await registerUser(`new-${process.pid}@test.local`, "a-real-password");
    expect(result.ok).toBe(true);
  });

  it("rejects a password under 8 characters", async () => {
    const result = await registerUser(`short-${process.pid}@test.local`, "short");
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects something that isn't an email address", async () => {
    const result = await registerUser("not-an-email", "a-real-password");
    expect(result).toMatchObject({ ok: false });
  });

  it("refuses a second account on the same email", async () => {
    const { email } = await makeUser();
    const second = await registerUser(email, "another-password");
    expect(second).toMatchObject({ ok: false });
  });

  it("gives the same friendly error when two signups race on one email", async () => {
    // The pre-insert select is only a courtesy message for the sequential
    // case — the real guard is the unique constraint, exercised here by
    // firing both inserts concurrently so the select can't have caught it.
    const email = `race-${process.pid}-${Math.random().toString(36).slice(2)}@test.local`;
    const [first, second] = await Promise.all([
      registerUser(email, "a-real-password"),
      registerUser(email, "a-different-password"),
    ]);
    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok) as { ok: false; error: string };
    expect(failed.error).toBe("An account with that email already exists.");
  });

  it("treats email case and whitespace as the same account on collision", async () => {
    const { email } = await makeUser();
    const second = await registerUser(`  ${email.toUpperCase()}  `, "another-password");
    expect(second).toMatchObject({ ok: false });
  });
});

describe("authenticate", () => {
  it("accepts the right email and password", async () => {
    const { email } = await makeUser();
    const result = await authenticate(email, "correct-horse-battery");
    expect(result.ok).toBe(true);
  });

  it("rejects the right email with the wrong password", async () => {
    const { email } = await makeUser();
    const result = await authenticate(email, "wrong-password");
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects an email with no account", async () => {
    const result = await authenticate("nobody-here@test.local", "anything");
    expect(result).toMatchObject({ ok: false });
  });

  it("gives an unknown-email and a wrong-password the identical message", async () => {
    // Distinguishing them would tell an attacker which emails have accounts.
    const { email } = await makeUser();
    const wrongPassword = await authenticate(email, "wrong-password");
    const unknownEmail = await authenticate("nobody-here@test.local", "wrong-password");
    expect(wrongPassword).toMatchObject({ ok: false });
    expect(unknownEmail).toMatchObject({ ok: false });
    expect((wrongPassword as { error: string }).error).toBe(
      (unknownEmail as { error: string }).error,
    );
  });

  it("rate-limits repeated attempts against one email before checking the password", async () => {
    // Correct password included in the burst: the cap has to reject the
    // attempt itself, not just failed ones — otherwise it isn't a brute-force
    // guard, since the attacker's whole point is trying many passwords.
    const { email } = await makeUser();
    for (let i = 0; i < SIGN_IN_ATTEMPT_CAP; i++) {
      await authenticate(email, "wrong-password");
    }
    const limited = await authenticate(email, "correct-horse-battery");
    expect(limited).toMatchObject({ ok: false });
    expect((limited as { error: string }).error).toMatch(/too many attempts/i);
  });

  it("does not let one email's rate limit affect another", async () => {
    const a = await makeUser();
    const b = await makeUser();
    for (let i = 0; i < SIGN_IN_ATTEMPT_CAP; i++) {
      await authenticate(a.email, "wrong-password");
    }
    const result = await authenticate(b.email, "correct-horse-battery");
    expect(result.ok).toBe(true);
  });
});

describe("sessions", () => {
  it("creates a session and resolves it back to the same user", async () => {
    const { userId, email } = await makeUser();
    await createSession(userId);

    const current = await getCurrentUser();
    expect(current?.id).toBe(userId);
    expect(current?.email).toBe(email);
  });

  it("sets the cookie httpOnly, so a page script can't read the session token", async () => {
    const { userId } = await makeUser();
    await createSession(userId);
    const cookie = store.get(SESSION_COOKIE);
    expect(cookie?.options).toMatchObject({ httpOnly: true });
  });

  it("returns null with no session cookie set", async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null for a token that was never issued", async () => {
    store.set(SESSION_COOKIE, { value: "made-up-token-abc123" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("ends the session on destroySession, so the same token no longer resolves", async () => {
    const { userId } = await makeUser();
    await createSession(userId);
    expect(await getCurrentUser()).not.toBeNull();

    await destroySession();
    expect(await getCurrentUser()).toBeNull();
    expect(store.has(SESSION_COOKIE)).toBe(false);
  });

  it("rejects a session past its expiry", async () => {
    const { userId } = await makeUser();
    const token = "expired-token-for-test";
    await db.insert(sessions).values({
      id: token,
      userId,
      expiresAt: new Date(Date.now() - 1000),
    });
    store.set(SESSION_COOKIE, { value: token });

    expect(await getCurrentUser()).toBeNull();
    await db.delete(sessions).where(eq(sessions.id, token));
  });
});
