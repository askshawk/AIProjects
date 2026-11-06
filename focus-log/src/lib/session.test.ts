import { describe, expect, it } from "vitest";
import { SESSION_DAYS, createSessionToken, isValidSessionToken, sessionSecret } from "./session";
import { checkPasscode, hashPasscode, verifyPasscode } from "./passcode";

const SECRET = "a".repeat(48);
const NOW = Date.parse("2026-10-18T12:00:00Z");

describe("session tokens", () => {
  it("accepts a fresh token signed with the same secret", () => {
    const { token } = createSessionToken(SECRET, NOW);
    expect(isValidSessionToken(token, SECRET, NOW)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = createSessionToken("b".repeat(48), NOW);
    expect(isValidSessionToken(token, SECRET, NOW)).toBe(false);
  });

  it("rejects an expired token", () => {
    const { token } = createSessionToken(SECRET, NOW);
    const later = NOW + (SESSION_DAYS + 1) * 24 * 60 * 60 * 1000;
    expect(isValidSessionToken(token, SECRET, later)).toBe(false);
  });

  it("rejects a token whose expiry was edited to extend it", () => {
    const { token } = createSessionToken(SECRET, NOW);
    const [, signature] = token.split(".");
    const forged = `${NOW + 10 * 365 * 24 * 60 * 60 * 1000}.${signature}`;
    expect(isValidSessionToken(forged, SECRET, NOW)).toBe(false);
  });

  it("rejects missing or malformed tokens and a missing secret", () => {
    expect(isValidSessionToken(undefined, SECRET, NOW)).toBe(false);
    expect(isValidSessionToken("garbage", SECRET, NOW)).toBe(false);
    expect(isValidSessionToken(createSessionToken(SECRET, NOW).token, undefined, NOW)).toBe(false);
  });
});

describe("passcode hashing", () => {
  it("verifies the right passcode and rejects the wrong one", async () => {
    const stored = await hashPasscode("correct horse battery");
    expect(await verifyPasscode("correct horse battery", stored)).toBe(true);
    expect(await verifyPasscode("wrong horse battery", stored)).toBe(false);
  });

  it("rejects a malformed stored hash instead of throwing", async () => {
    expect(await verifyPasscode("anything", "not-a-hash")).toBe(false);
  });
});

describe("simple passcode setup", () => {
  it("derives a session secret from APP_PASSCODE when SESSION_SECRET isn't set", () => {
    const a = sessionSecret({ APP_PASSCODE: "correct horse battery" });
    expect(a).toBeTruthy();
    expect(a).toBe(sessionSecret({ APP_PASSCODE: "correct horse battery" }));
    // A new passcode means a new secret, which signs old sessions out.
    expect(a).not.toBe(sessionSecret({ APP_PASSCODE: "a different passcode" }));
    expect(sessionSecret({ SESSION_SECRET: SECRET, APP_PASSCODE: "x" })).toBe(SECRET);
    expect(sessionSecret({})).toBeUndefined();
  });

  it("checks a plain APP_PASSCODE, and falls back to the hash", async () => {
    expect(await checkPasscode("correct horse battery", { APP_PASSCODE: "correct horse battery" })).toBe(true);
    expect(await checkPasscode("wrong", { APP_PASSCODE: "correct horse battery" })).toBe(false);
    const hash = await hashPasscode("hashed passcode");
    expect(await checkPasscode("hashed passcode", { APP_PASSCODE_HASH: hash })).toBe(true);
    expect(await checkPasscode("anything", {})).toBe(false);
  });
});
