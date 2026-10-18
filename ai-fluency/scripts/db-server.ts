/**
 * Local Postgres without installing Postgres (same approach as iron-atlas).
 *
 * PGlite is Postgres compiled to WASM; `pglite-socket` puts it behind a real
 * wire-protocol port, so the app, drizzle-kit, and scripts all use the same
 * `postgres.js` driver and DATABASE_URL they would use against Neon.
 *
 *   npm run db   # leave running in its own terminal
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = process.env.PGLITE_DIR ?? "./.pglite";
// 5433, not 5432, so it can run next to iron-atlas's local database.
const PORT = Number(process.env.PGLITE_PORT ?? 5433);

async function main() {
  // pgvector powers the "Ask my glossary" search index.
  const db = await PGlite.create({ dataDir: DATA_DIR, extensions: { vector } });

  // PGlite is single-connection; the socket server multiplexes over it.
  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`PGlite listening on port ${PORT} (database "postgres")`);
  console.log(`data dir: ${DATA_DIR}`);

  const shutdown = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
