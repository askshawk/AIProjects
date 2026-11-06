import { execFileSync } from "node:child_process";

/**
 * Runs before `next build` (see the "build" script). On Vercel production
 * builds it applies database migrations, so a deploy never needs a manual
 * step. Everywhere else (local builds, preview builds) it does nothing:
 * previews must never touch the production database.
 */
if (process.env.VERCEL_ENV !== "production") {
  console.log("deploy-setup: not a Vercel production build, skipping migrations.");
  process.exit(0);
}

execFileSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env: process.env });
