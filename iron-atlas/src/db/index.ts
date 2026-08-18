import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local, then run `npm run db` for a local Postgres.",
  );
}

/**
 * Next.js dev reloads modules on every edit; without a global cache each reload
 * would open a new pool and eventually exhaust connections.
 */
const globalForDb = globalThis as unknown as { __ironAtlasSql?: postgres.Sql };

const isLocal = url.includes("127.0.0.1") || url.includes("localhost");

const sql =
  globalForDb.__ironAtlasSql ??
  postgres(url, {
    // Local is PGlite behind a multiplexing socket server (see scripts/db-server.ts).
    // The multiplexer is best-effort: concurrent in-flight queries — e.g. from
    // Next's <Link> viewport prefetching hitting several program pages at
    // once — intermittently corrupt a response frame ("offset out of range"),
    // especially on larger rows. This is independent of Turbopack vs webpack;
    // confirmed by reproducing under both. A single connection makes
    // postgres.js queue queries instead of interleaving them, which costs
    // nothing at dev-time traffic. Hosted Postgres has no such constraint.
    max: isLocal ? 1 : 10,
    // PGlite's socket server speaks plaintext; hosted Postgres requires TLS.
    ssl: isLocal ? false : "require",
  });

if (process.env.NODE_ENV !== "production") globalForDb.__ironAtlasSql = sql;

export const db = drizzle(sql, { schema });
export { schema, sql };
