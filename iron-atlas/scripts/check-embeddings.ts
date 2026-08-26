import "./env";
import { EMBEDDING_DIM, tryEmbedOne } from "@/lib/embeddings";

/**
 * Confirms the embedding provider is reachable and agrees with the schema.
 * Run this after changing provider, model, or dimension — a mismatch here is
 * silent everywhere else until search quietly stops working.
 *
 * Prints nothing sensitive — never the key itself.
 *
 *   npm run check:embeddings
 */
async function main() {
  const v = await tryEmbedOne("barbell back squat", "document");
  if (!v) {
    console.log("embeddings NOT available — VOYAGE_API_KEY missing or rejected");
    process.exit(1);
  }
  console.log(`embeddings OK — ${v.length} dims (schema expects ${EMBEDDING_DIM})`);
  if (v.length !== EMBEDDING_DIM) {
    console.log("DIMENSION MISMATCH — the migration and schema disagree");
    process.exit(1);
  }
}
main();
