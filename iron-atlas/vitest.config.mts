import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: [".env.local", ".env"] });

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "node",
    // The local database is PGlite behind a multiplexing socket server, which
    // corrupts response frames when queries overlap (see src/db/index.ts).
    // Running test files in parallel is enough to trigger it, so don't.
    fileParallelism: false,
    // Embedding-backed tests load a model on first run; the default 5s is tight.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
