import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: [".env.local", ".env"] });

/**
 * Applies the SQL migrations in ./drizzle to whatever DATABASE_URL points at:
 * the local PGlite socket or Neon. Prefer this over `drizzle-kit push` for
 * anything real, since push diffs a live database interactively.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  const sql = postgres(url, { max: 1, ssl: isLocal ? false : "require" });

  console.log(`migrating ${isLocal ? "local PGlite" : new URL(url).host}...`);
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
