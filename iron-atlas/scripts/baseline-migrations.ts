import "./env";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

/**
 * Records already-applied migrations without re-running them.
 *
 * This local database was originally built with `drizzle-kit push`, so its
 * schema is current but `drizzle.__drizzle_migrations` is empty — which makes
 * `db:migrate` try to replay 0000 and die on "type already exists". Baselining
 * writes the hashes of migrations that are demonstrably already in the schema,
 * so future migrations apply cleanly through the normal path instead of being
 * hand-patched (which is how the schema drifted in the first place).
 *
 *   npx tsx scripts/baseline-migrations.ts 3   # first three are already applied
 *
 * Only ever pass a count you have confirmed is already applied. A fresh
 * database needs none of this — it should just run `db:migrate`.
 */
async function main() {
  const count = Number(process.argv[2]);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("pass how many leading migrations are already applied, e.g. 3");
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
  const sql = postgres(url, { max: 1, ssl: isLocal ? false : "require" });

  // Same reader the migrator uses, so the hashes match exactly. Returned in
  // journal order, which is the order they'd have been applied in.
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  if (count > migrations.length) {
    throw new Error(`only ${migrations.length} migrations exist, cannot baseline ${count}`);
  }

  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  for (const migration of migrations.slice(0, count)) {
    const [existing] = await sql`SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${migration.hash}`;
    if (existing) {
      console.log(`  ${migration.hash.slice(0, 12)}: already recorded`);
      continue;
    }
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${migration.hash}, ${migration.folderMillis})
    `;
    console.log(`  ${migration.hash.slice(0, 12)}: recorded as applied`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
