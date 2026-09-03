import "./env";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql as rawSql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";
import {
  exercises,
  programDays,
  programExercises,
  programWeeks,
  programs,
} from "@/db/schema";

/**
 * Copies only the library — exercises and programs, with their weeks/days/
 * exercises — from local into Neon. Deliberately does not touch any
 * user-owned table (users, sessions, forks, logbook, chat) — those should
 * start empty in production, not carry over local dev/demo accounts.
 *
 * Run once, right after `db:migrate` has created Neon's schema. Re-running
 * against a Neon database that already has rows will hit the primary key
 * conflict and stop — this is a one-time seed, not a sync.
 */

const LOCAL_URL = process.env.DATABASE_URL;
const NEON_URL = process.env.NEON_DATABASE_URL;

async function main() {
  if (!LOCAL_URL) throw new Error("DATABASE_URL (local) is not set");
  if (!NEON_URL)
    throw new Error("NEON_DATABASE_URL is not set — pass it inline");

  const localSql = postgres(LOCAL_URL, { max: 1, ssl: false });
  const neonSql = postgres(NEON_URL, { max: 1, ssl: "require" });
  const local = drizzle(localSql, { schema });
  const neon = drizzle(neonSql, { schema });

  // Dependency order: exercises has no FK; programs has none either;
  // programWeeks -> programs; programDays -> programWeeks;
  // programExercises -> programDays + exercises.
  const tables = [
    { name: "exercises", table: exercises },
    { name: "programs", table: programs },
    { name: "program_weeks", table: programWeeks },
    { name: "program_days", table: programDays },
    { name: "program_exercises", table: programExercises },
  ] as const;

  // A single INSERT with thousands of parameterized rows blows the query
  // builder's recursion limit — program_exercises has 12,500+ rows locally.
  const BATCH_SIZE = 500;

  for (const { name, table } of tables) {
    const rows = await local.select().from(table);
    if (rows.length === 0) {
      console.log(`${name}: nothing to copy`);
      continue;
    }

    const [{ count: alreadyThere }] = await neon
      .select({ count: rawSql<number>`count(*)::int` })
      .from(table);
    if (alreadyThere >= rows.length) {
      console.log(`${name}: already copied (${alreadyThere} rows) — skipping`);
      continue;
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await neon.insert(table).values(rows.slice(i, i + BATCH_SIZE) as never);
    }
    // Explicit-id inserts don't advance the destination's serial sequence —
    // the next default-id insert in Neon would otherwise collide.
    await neon.execute(
      rawSql.raw(
        `select setval(pg_get_serial_sequence('${name}', 'id'), (select max(id) from ${name}))`,
      ),
    );
    console.log(`${name}: copied ${rows.length} rows`);
  }

  console.log("\nverifying row counts…");
  for (const { name, table } of tables) {
    const [{ count: localCount }] = await local
      .select({ count: rawSql<number>`count(*)::int` })
      .from(table);
    const [{ count: neonCount }] = await neon
      .select({ count: rawSql<number>`count(*)::int` })
      .from(table);
    const ok = localCount === neonCount ? "OK" : "MISMATCH";
    console.log(`  ${name}: local=${localCount} neon=${neonCount} ${ok}`);
  }

  await localSql.end();
  await neonSql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
