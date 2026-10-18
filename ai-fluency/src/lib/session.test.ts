import { describe, expect, it } from "vitest";
import { SESSION_DAYS, createSessionToken, isValidSessionToken } from "./session";
import { hashPasscode, verifyPasscode } from "./passcode";

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
