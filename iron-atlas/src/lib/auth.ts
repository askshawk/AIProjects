import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { sessions, signInAttempts, users } from "@/db/schema";

/**
 * Password hashing and sessions, hand-rolled on Node's crypto.
 *
 * scrypt is deliberately slow and memory-hard, which is the point — it makes
 * an offline attack on a stolen hash expensive. The parameters below are the
 * Node defaults except for N, raised to 2^15. Session tokens are opaque random
 * bytes stored server-side, so a token is useless without the row.
 */

/** promisify() drops scrypt's options overload, so wrap it by hand. */
function scryptAsync(
  password: string,
  salt: string,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived),
    );
  });
}

const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

export const SESSION_COOKIE = "iron-atlas-session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);

  // Constant-time: a length-dependent early return would leak information.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ id: token, userId, expiresAt });

  // Opportunistic cleanup — no cron needed at this scale.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });

  return token;
}

export type CurrentUser = {
  id: number;
  email: string;
  displayName: string | null;
  unitPreference: string;
  isAdmin: boolean;
};

/** Resolves the signed-in user, or null. Safe to call from any server component. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      unitPreference: users.unitPreference,
      isAdmin: users.isAdmin,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())));

  return row ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, token));
  store.delete(SESSION_COOKIE);
}

/** Normalises emails so "Alan@X.com " and "alan@x.com" are the same account. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type AuthResult =
  { ok: true; userId: number } | { ok: false; error: string };

export async function registerUser(
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);

  if (!email.includes("@") || email.length < 3) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password needs to be at least 8 characters." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing)
    return { ok: false, error: "An account with that email already exists." };

  // The select above is a courtesy for the common case's error message, not
  // the actual guard — `users.email` is unique, so two concurrent signups for
  // the same address can both pass that check and race into this insert.
  // Catch the constraint violation rather than let it become an unhandled
  // exception past the AuthResult union.
  try {
    const [created] = await db
      .insert(users)
      .values({ email, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });

    return { ok: true, userId: created.id };
  } catch (err) {
    // postgres.js's own error carries the code; drizzle wraps it in its own
    // "Failed query" error with that as `.cause`, so check both shapes.
    const code = (candidate: unknown): unknown =>
      candidate && typeof candidate === "object" && "code" in candidate
        ? (candidate as { code: unknown }).code
        : undefined;
    if (
      code(err) === "23505" ||
      code((err as { cause?: unknown } | undefined)?.cause) === "23505"
    ) {
      return {
        ok: false,
        error: "An account with that email already exists.",
      };
    }
    throw err;
  }
}

/** Sign-in attempts allowed per email within one window. */
export const SIGN_IN_ATTEMPT_CAP = Number(
  process.env.SIGN_IN_ATTEMPT_CAP ?? 10,
);
const SIGN_IN_WINDOW_MINUTES = 15;

function signInWindow(): string {
  const bucketMs = SIGN_IN_WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(Date.now() / bucketMs) * bucketMs).toISOString();
}

/**
 * Atomically claims one sign-in attempt for this email in the current
 * window, before any password check runs. Mirrors chatLimits.ts's
 * claimDailyMessage: the `setWhere` on the conflict update makes the
 * check-and-increment a single atomic statement, so concurrent attempts
 * can't all slip through sitting one under the cap.
 */
async function claimSignInAttempt(email: string): Promise<boolean> {
  const window = signInWindow();
  const rows = await db
    .insert(signInAttempts)
    .values({ email, window, count: 1 })
    .onConflictDoUpdate({
      target: [signInAttempts.email, signInAttempts.window],
      set: { count: sql`${signInAttempts.count} + 1` },
      setWhere: sql`${signInAttempts.count} < ${SIGN_IN_ATTEMPT_CAP}`,
    })
    .returning({ count: signInAttempts.count });
  return rows.length > 0;
}

export async function authenticate(
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);

  // Claimed before the expensive scrypt check runs, not after — scrypt at
  // N=2^15 costs real CPU and ~32MB per call, so the cap has to stop an
  // attempt from being *made*, not just stop it from succeeding.
  if (!(await claimSignInAttempt(email))) {
    return {
      ok: false,
      error: "Too many attempts — try again in a few minutes.",
    };
  }

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  // Same message either way — distinguishing them tells an attacker which
  // emails have accounts.
  const GENERIC = "Email or password is incorrect.";
  if (!user) return { ok: false, error: GENERIC };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: GENERIC };
  }

  return { ok: true, userId: user.id };
}
