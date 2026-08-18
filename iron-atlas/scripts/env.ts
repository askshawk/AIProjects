import { config } from "dotenv";

/**
 * Import this first in any standalone script. Next.js loads .env.local on its
 * own, but tsx does not, and every script here needs DATABASE_URL.
 */
config({ path: [".env.local", ".env"] });
