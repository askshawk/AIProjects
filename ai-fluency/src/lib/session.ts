import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless session tokens for a single-user app.
 *
 * There's only one person who can sign in, so there's no session table: the
 * cookie holds an expiry time plus an HMAC of it, signed with SESSION_SECRET.
 * Nobody can forge or extend one without the secret, and rotating the secret
 * signs every device out at once.
 *
 * No Next.js imports here, so proxy.ts and tests can both use it.
 */

export const SESSION_COOKIE = "ai-fluency-session";
export const SESSION_DAYS = 30;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = String(expiresAt.getTime());
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function isValidSessionToken(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
