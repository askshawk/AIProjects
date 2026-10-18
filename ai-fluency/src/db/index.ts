import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { assertProductionConfig } from "@/lib/config";

// Fail the deploy loudly instead of serving a broken app.
assertProductionConfig();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db` for a local Postgres.",
  );
}

/** Dev reloads modules on every edit; cache the pool so reloads don't leak connections. */
const globalForDb = globalThis as unknown as { __aiFluencySql?: postgres.Sql };

const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

const sql =
  globalForDb.__aiFluencySql ??
  postgres(url, {
    // Local PGlite sits behind a best-effort multiplexer that can corrupt
    // overlapping queries (see iron-atlas/src/db/index.ts). One connection
    // makes postgres.js queue them instead. Hosted Postgres has no such limit.
    max: isLocal ? 1 : 5,
    ssl: isLocal ? false : "require",
  });

if (process.env.NODE_ENV !== "production") globalForDb.__aiFluencySql = sql;

export const db = drizzle(sql, { schema });
export { schema };
