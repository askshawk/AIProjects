import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { cookies, headers } from "next/headers";
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

/**
 * Every message these functions can return.
 *
 * Exported so the sign-in page can whitelist what it renders. Failures
 * round-trip through the URL, and echoing that text back unchecked let anyone
 * put arbitrary wording in a styled alert directly above the real password
 * field, on the real domain over HTTPS — a convincing phishing setup even
 * though React escapes the markup. Anything not in this set is replaced with a
 * generic message.
 */
export const AUTH_MESSAGES = [
  "That doesn't look like an email address.",
  "Password needs to be at least 8 characters.",
  "An account with that email already exists.",
  "Email or password is incorrect.",
  "Too many attempts — try again in a few minutes.",
] as const;

export function isKnownAuthMessage(value: string): boolean {
  return (AUTH_MESSAGES as readonly string[]).includes(value);
}

export async function registerUser(
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);

  if (!email.includes("@") || email.length < 3) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password needs to be at least 8 characters." };
  }

  // Registration was the one unthrottled entrance in the app, which mattered
  // more than it looks: every spend guard on the coach is keyed per user, so
  // unlimited free accounts meant unlimited daily message allowances against
  // one API key. It also ran scrypt (~32MB, real CPU) for any anonymous
  // caller. Same bucket mechanism as sign-in, keyed on the caller.
  if (!(await claimSignInAttempt(`signup:${await requestSource()}`))) {
    return {
      ok: false,
      error: "Too many attempts — try again in a few minutes.",
    };
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

/** Sign-in attempts allowed from one source within a window. */
export const SIGN_IN_ATTEMPT_CAP = Number(
  process.env.SIGN_IN_ATTEMPT_CAP ?? 10,
);
const SIGN_IN_WINDOW_MINUTES = 15;
/** Longest string accepted as an email — RFC 5321's limit. */
const MAX_EMAIL_LENGTH = 254;

function signInWindow(): string {
  const bucketMs = SIGN_IN_WINDOW_MINUTES * 60 * 1000;
  return new Date(Math.floor(Date.now() / bucketMs) * bucketMs).toISOString();
}

/**
 * Best-effort client address. Only ever used as a rate-limit bucket key, so a
 * spoofed or missing value costs nothing beyond sharing a bucket — it is never
 * treated as identity.
 */
async function requestSource(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || h.get("x-real-ip")?.trim();
    return ip ? `ip:${ip.slice(0, 64)}` : "ip:unknown";
  } catch {
    // No request scope (scripts, tests) — one shared bucket is fine.
    return "ip:unknown";
  }
}

/**
 * Atomically claims one sign-in attempt for a bucket in the current window.
 * The `setWhere` on the conflict update makes check-and-increment a single
 * statement, so concurrent attempts can't all slip through at the cap.
 *
 * The bucket is the **request source, not the email**. Keying it on the email
 * meant anyone who knew an address — the owner's is in this repo's commit
 * history — could burn its attempts with garbage passwords and lock the real
 * owner out for the rest of the window, indefinitely, including the admin
 * account. Rate-limiting the caller instead still throttles brute force and
 * still shields scrypt (~32MB and real CPU per call) from being driven by an
 * anonymous request, without handing anyone a way to disable someone else's
 * account.
 */
async function claimSignInAttempt(subject: string): Promise<boolean> {
  const window = signInWindow();
  const rows = await db
    .insert(signInAttempts)
    .values({ email: subject, window, count: 1 })
    .onConflictDoUpdate({
      target: [signInAttempts.email, signInAttempts.window],
      set: { count: sql`${signInAttempts.count} + 1` },
      setWhere: sql`${signInAttempts.count} < ${SIGN_IN_ATTEMPT_CAP}`,
    })
    .returning({ count: signInAttempts.count });

  // Opportunistic cleanup, same pattern as expired sessions in createSession.
  // Without it this table only ever grows.
  //
  // Awaited rather than fired and forgotten: an unawaited write outlives the
  // call that started it, which on a single-connection database means it
  // interleaves with whatever runs next. It's one indexed delete on a tiny
  // table, so the latency is not worth the class of bug.
  await db
    .delete(signInAttempts)
    .where(lt(signInAttempts.window, signInWindow()));

  return rows.length > 0;
}

export async function authenticate(
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw);

  const GENERIC_CREDENTIALS = "Email or password is incorrect.";
  // Rejected before it can reach the database. This value used to be written
  // straight into the rate-limit table with no validation, so junk of any
  // length became a permanent row — a cheap way to inflate storage.
  if (email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
    return { ok: false, error: GENERIC_CREDENTIALS };
  }

  // Claimed before the expensive scrypt check runs, not after — scrypt at
  // N=2^15 costs real CPU and ~32MB per call, so the cap has to stop an
  // attempt from being *made*, not just stop it from succeeding.
  if (!(await claimSignInAttempt(await requestSource()))) {
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
  if (!user) return { ok: false, error: GENERIC_CREDENTIALS };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: GENERIC_CREDENTIALS };
  }

  return { ok: true, userId: user.id };
}
