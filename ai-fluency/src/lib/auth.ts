import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { signInAttempts } from "@/db/schema";
import { verifyPasscode } from "./passcode";
import { SESSION_COOKIE, createSessionToken, isValidSessionToken } from "./session";

/** Five tries per client every 15 minutes is plenty for a person, useless for a script. */
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function isSignedIn(): Promise<boolean> {
  const store = await cookies();
  return isValidSessionToken(store.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
}

/**
 * The real check. proxy.ts already redirects signed-out page loads, but
 * server actions are callable directly, so every action starts with this too.
 */
export async function requireSignedIn(): Promise<void> {
  if (!(await isSignedIn())) redirect("/sign-in");
}

async function clientKey(): Promise<string> {
  const h = await headers();
  // Vercel sets x-forwarded-for; the first entry is the client.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/**
 * Counts this attempt and reports whether it's allowed. The increment is one
 * atomic upsert, so parallel requests can't all slip under the limit.
 */
async function claimAttempt(key: string): Promise<boolean> {
  const now = Date.now();
  const windowMs = WINDOW_MINUTES * 60 * 1000;
  const window = new Date(Math.floor(now / windowMs) * windowMs);

  const [row] = await db
    .insert(signInAttempts)
    .values({ key, window })
    .onConflictDoUpdate({
      target: [signInAttempts.key, signInAttempts.window],
      set: { count: sql`${signInAttempts.count} + 1` },
    })
    .returning({ count: signInAttempts.count });

  // Opportunistic cleanup; no cron needed at this scale.
  await db.delete(signInAttempts).where(lt(signInAttempts.window, new Date(now - 24 * 60 * 60 * 1000)));

  return row.count <= MAX_ATTEMPTS;
}

export type SignInResult = { error: string } | undefined;

export async function signIn(passcode: string): Promise<SignInResult> {
  const stored = process.env.APP_PASSCODE_HASH;
  const secret = process.env.SESSION_SECRET;
  if (!stored || !secret) {
    return { error: "Sign-in isn't set up yet. Add APP_PASSCODE_HASH and SESSION_SECRET to the environment." };
  }

  const key = await clientKey();
  if (!(await claimAttempt(key))) {
    return { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` };
  }
  if (!(await verifyPasscode(passcode, stored))) {
    return { error: "That passcode isn't right." };
  }
  // A successful sign-in clears earlier typos, so they don't count toward a lockout later.
  await db.delete(signInAttempts).where(eq(signInAttempts.key, key));

  const { token, expiresAt } = createSessionToken(secret);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
  return undefined;
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
