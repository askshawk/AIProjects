/**
 * Production configuration guards.
 *
 * These fail at startup rather than at the first request. A deploy that boots
 * against a local database, or serves session cookies over plain HTTP, is
 * worse than one that refuses to start — the first looks fine until someone's
 * training data goes missing.
 *
 * Every problem is reported at once, so fixing a deploy is one round trip
 * rather than four.
 */

export type ConfigProblem = { setting: string; problem: string };

/** Only the variables we actually read — keeps callers and tests honest. */
export type Env = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  APP_URL?: string;
  SKIP_CONFIG_CHECK?: string;
  /** Next sets this to 'phase-production-build' while building. */
  NEXT_PHASE?: string;
};

export function checkProductionConfig(env: Env): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const url = env.DATABASE_URL;

  if (!url) {
    problems.push({
      setting: "DATABASE_URL",
      problem: "not set — the app cannot start without a database.",
    });
  } else if (url.includes("127.0.0.1") || url.includes("localhost")) {
    problems.push({
      setting: "DATABASE_URL",
      problem:
        "points at localhost. That's the local PGlite dev database, which does not exist on a deployed host.",
    });
  }

  if (!env.ANTHROPIC_API_KEY) {
    problems.push({
      setting: "ANTHROPIC_API_KEY",
      problem: "not set — /coach will fail on every request.",
    });
  }

  // Cookies are marked `secure` in production, so they simply won't be sent
  // over plain HTTP and nobody would be able to stay signed in.
  const appUrl = env.APP_URL;
  if (appUrl && !appUrl.startsWith("https://")) {
    problems.push({
      setting: "APP_URL",
      problem:
        "is not https. Session cookies are secure-only in production and won't be sent.",
    });
  }

  return problems;
}

export function formatConfigProblems(problems: ConfigProblem[]): string {
  return [
    `Iron Atlas cannot start — ${problems.length} configuration problem${
      problems.length === 1 ? "" : "s"
    }:`,
    ...problems.map((p) => `  • ${p.setting}: ${p.problem}`),
    "",
    "See DEPLOY.md for what each of these should be set to.",
  ].join("\n");
}

/**
 * The canonical origin, for anything that needs an absolute URL — metadata's
 * `metadataBase`, the sitemap, `robots.txt`. Falls back to the local dev
 * server so those still resolve to *something* valid before APP_URL is set.
 */
export function siteUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3100";
}

/** Called once at module load in production. No-op in development and tests. */
export function assertProductionConfig(env: Env = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (env.SKIP_CONFIG_CHECK === "1") return;
  // `next build` runs with NODE_ENV=production but no runtime environment —
  // it imports every module to collect page data. Checking there would make a
  // correct deploy impossible to build.
  if (env.NEXT_PHASE === "phase-production-build") return;

  const problems = checkProductionConfig(env);
  if (problems.length > 0) throw new Error(formatConfigProblems(problems));
}
