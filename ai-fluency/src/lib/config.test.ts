import { describe, expect, it } from "vitest";
import { assertProductionConfig, checkProductionConfig } from "./config";

const GOOD = {
  DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require",
  APP_PASSCODE: "correct horse battery",
};

describe("checkProductionConfig", () => {
  it("passes with just a database and a passcode", () => {
    expect(checkProductionConfig(GOOD)).toEqual([]);
  });

  it("still accepts the hashed passcode setup", () => {
    expect(checkProductionConfig({ DATABASE_URL: GOOD.DATABASE_URL, APP_PASSCODE_HASH: "salt:hash" })).toEqual([]);
  });

  it("reports every problem at once", () => {
    const problems = checkProductionConfig({ DATABASE_URL: "postgres://postgres@127.0.0.1:5433/postgres" });
    expect(problems).toHaveLength(2);
  });

  it("rejects a short passcode or a short explicit session secret", () => {
    expect(checkProductionConfig({ ...GOOD, APP_PASSCODE: "short" })).toHaveLength(1);
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
