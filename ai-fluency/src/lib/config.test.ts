import { describe, expect, it } from "vitest";
import { assertProductionConfig, checkProductionConfig } from "./config";

const GOOD = {
  DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require",
  APP_PASSCODE_HASH: "salt:hash",
  SESSION_SECRET: "s".repeat(48),
};

describe("checkProductionConfig", () => {
  it("passes a complete config", () => {
    expect(checkProductionConfig(GOOD)).toEqual([]);
  });

  it("reports every problem at once", () => {
    const problems = checkProductionConfig({ DATABASE_URL: "postgres://postgres@127.0.0.1:5433/postgres" });
    expect(problems).toHaveLength(3);
  });

  it("rejects a short session secret", () => {
    expect(checkProductionConfig({ ...GOOD, SESSION_SECRET: "short" })).toHaveLength(1);
  });
});

describe("assertProductionConfig", () => {
  it("only enforces in production, and not during the build", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(/misconfigured/);
  });
});
