import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

/**
 * Brings the "Ask my glossary" search index up to date: embeds new or edited
 * cards and notes, and drops entries for deleted ones. Runs automatically on
 * production deploys (see deploy-setup.ts); run it by hand with
 * `npm run embed:sync`. Without a Voyage key it skips rather than failing the
 * build, so the rest of the app still deploys.
 */
async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn("embed-sync: VOYAGE_API_KEY is not set, skipping. Ask my glossary will be unavailable.");
    return;
  }
  // Imported after dotenv so the database module sees DATABASE_URL.
  const { allIndexItems, syncIndex } = await import("../src/lib/embeddings");
  const items = await allIndexItems();
  console.log(`embed-sync: checking ${items.length} cards and note chunks...`);
  const { embedded, removed } = await syncIndex(items, { retry: true, prune: true });
  console.log(`embed-sync: embedded ${embedded}, removed ${removed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
