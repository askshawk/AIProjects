/**
 * Local Postgres without installing Postgres (same approach as iron-atlas and
 * ai-fluency). PGlite is Postgres compiled to WASM; pglite-socket puts it
 * behind a real port, so the app uses the same driver it uses against Neon.
 *
 *   npm run db   # leave running in its own terminal
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DATA_DIR = process.env.PGLITE_DIR ?? "./.pglite";
// 5434 so it can run next to iron-atlas (5432) and ai-fluency (5433).
const PORT = Number(process.env.PGLITE_PORT ?? 5434);

async function main() {
  const db = await PGlite.create({ dataDir: DATA_DIR });
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
