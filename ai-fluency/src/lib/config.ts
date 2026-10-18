/**
 * Production configuration guard, modeled on iron-atlas's. A deploy with a
 * missing secret or a localhost database should refuse to start rather than
 * look fine until the first sign-in fails. Every problem is reported at once.
 */

export type Env = {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  APP_PASSCODE?: string;
  APP_PASSCODE_HASH?: string;
  SESSION_SECRET?: string;
  /** Next sets this to 'phase-production-build' while building. */
  NEXT_PHASE?: string;
};

export function checkProductionConfig(env: Env): string[] {
  const problems: string[] = [];
  const url = env.DATABASE_URL;

  if (!url) problems.push("DATABASE_URL is not set.");
  else if (url.includes("127.0.0.1") || url.includes("localhost"))
    problems.push("DATABASE_URL points at localhost, which doesn't exist on a deployed host.");

  if (env.APP_PASSCODE) {
    if (env.APP_PASSCODE.length < 8) problems.push("APP_PASSCODE must be at least 8 characters.");
  } else if (!env.APP_PASSCODE_HASH?.includes(":")) {
    problems.push("APP_PASSCODE is not set. Add it in Vercel: it's the passcode you'll type to sign in.");
  }

  // Optional: without it, the session secret is derived from APP_PASSCODE.
  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32)
    problems.push("SESSION_SECRET is set but shorter than 32 characters. Remove it or make it longer.");

  return problems;
}

export function assertProductionConfig(env: Env = process.env as Env): void {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return;
  const problems = checkProductionConfig(env);
  if (problems.length) {
    throw new Error(`AI Fluency is misconfigured:\n- ${problems.join("\n- ")}`);
  }
}
