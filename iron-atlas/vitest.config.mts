import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: [".env.local", ".env"] });

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    // Embedding-backed tests load a model on first run; the default 5s is tight.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
