import { execFileSync } from "node:child_process";

/**
 * Runs before `next build` (see the "build" script). On Vercel production
 * builds it applies database migrations and refreshes the search index, so a
 * deploy never needs a manual step. Everywhere else (local builds, Vercel
 * preview builds) it does nothing: previews must never touch the production
 * database, and a local build shouldn't need a database running.
 */
if (process.env.VERCEL_ENV !== "production") {
  console.log("deploy-setup: not a Vercel production build, skipping migrations.");
  process.exit(0);
}

const run = (script: string) =>
  execFileSync("npx", ["tsx", script], { stdio: "inherit", env: process.env });

run("scripts/migrate.ts");
run("scripts/embed-sync.ts");
