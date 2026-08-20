import { describe, expect, it } from "vitest";
import { assertProductionConfig, checkProductionConfig, type Env } from "@/lib/config";

const NEON = "postgres://user:pass@ep-cool-name.us-east-2.aws.neon.tech/iron_atlas";

const good = {
  DATABASE_URL: NEON,
  ANTHROPIC_API_KEY: "sk-ant-fake-for-tests",
  APP_URL: "https://iron-atlas.example.com",
} satisfies Env;

describe("checkProductionConfig", () => {
  it("passes a correctly configured deploy", () => {
    expect(checkProductionConfig(good)).toEqual([]);
  });

  it("catches a local database URL, the mistake that looks fine until it isn't", () => {
    const problems = checkProductionConfig({
      ...good,
      DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/postgres",
    });
    expect(problems).toHaveLength(1);
    expect(problems[0].setting).toBe("DATABASE_URL");
    expect(problems[0].problem).toContain("localhost");
  });

  it("catches a missing database URL", () => {
    const problems = checkProductionConfig({ ...good, DATABASE_URL: undefined });
    expect(problems[0].setting).toBe("DATABASE_URL");
  });

  it("catches a missing API key", () => {
    const problems = checkProductionConfig({ ...good, ANTHROPIC_API_KEY: undefined });
    expect(problems.map((p) => p.setting)).toContain("ANTHROPIC_API_KEY");
  });

  it("catches a non-https app URL, which silently breaks sign-in", () => {
    const problems = checkProductionConfig({ ...good, APP_URL: "http://example.com" });
    expect(problems.map((p) => p.setting)).toContain("APP_URL");
  });

  it("reports every problem at once rather than one per deploy attempt", () => {
    const problems = checkProductionConfig({
      DATABASE_URL: "postgres://localhost/x",
      APP_URL: "http://example.com",
    } satisfies Env);
    expect(problems).toHaveLength(3);
  });
});

describe("assertProductionConfig", () => {
  it("does nothing outside production", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "development" } satisfies Env),
    ).not.toThrow();
  });

  it("throws in production when misconfigured, naming every problem", () => {
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production" } satisfies Env),
    ).toThrow(/DATABASE_URL[\s\S]*ANTHROPIC_API_KEY/);
  });

  it("passes in production when configured", () => {
    expect(() =>
      assertProductionConfig({ ...good, NODE_ENV: "production" }),
    ).not.toThrow();
  });

  it("skips the check during `next build`, which has no runtime env", () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      } satisfies Env),
    ).not.toThrow();
  });

  it("can be bypassed deliberately for a build step", () => {
    // `next build` imports modules without runtime env available.
    expect(() =>
      assertProductionConfig({
        NODE_ENV: "production",
        SKIP_CONFIG_CHECK: "1",
      } satisfies Env),
    ).not.toThrow();
  });
});
