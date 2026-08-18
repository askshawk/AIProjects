/**
 * Local Postgres without installing Postgres.
 *
 * PGlite is Postgres compiled to WASM; `pglite-socket` puts it behind a real
 * wire-protocol port. That means the app, drizzle-kit, and one-off scripts all
 * speak to it with the same `postgres.js` driver and the same DATABASE_URL they
 * would use against Neon in production — no Docker, no sqlite dialect drift.
 *
 *   npm run db   # leave running in its own terminal
 */
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = process.env.PGLITE_DIR ?? "./.pglite";
const PORT = Number(process.env.PGLITE_PORT ?? 5432);

async function main() {
  const db = await PGlite.create({
    dataDir: DATA_DIR,
    extensions: { vector },
  });

  // Idempotent: pgvector has to exist before drizzle-kit pushes a vector column.
  await db.exec("CREATE EXTENSION IF NOT EXISTS vector;");

  // PGlite is a single-connection database; the socket server multiplexes over
  // it. Without this it accepts exactly one client and resets everyone else —
  // which the Next dev server trips instantly, since it pools per worker.
  const server = new PGLiteSocketServer({
    db,
    port: PORT,
    host: "127.0.0.1",
    maxConnections: 20,
  });
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
