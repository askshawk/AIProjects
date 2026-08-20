import "./env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies migrations to whatever DATABASE_URL points at — the local PGlite
 * socket or a hosted Postgres. Used instead of `drizzle-kit push` for anything
 * real: push diffs against a live database and needs an interactive TTY to
 * confirm destructive changes, neither of which belongs in a deploy.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  // max: 1 — migrations must run serially on one connection.
  const sql = postgres(url, { max: 1, ssl: isLocal ? false : "require" });

  const target = isLocal ? "local PGlite" : new URL(url).host;
  console.log(`migrating ${target}…`);

  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });

  console.log("migrations applied");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
