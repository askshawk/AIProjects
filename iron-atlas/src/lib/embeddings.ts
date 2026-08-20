/**
 * Embeddings via Voyage.
 *
 * This ran locally on transformers.js until deployment forced the issue: the
 * model plus onnxruntime is ~413 MB installed, and a Vercel serverless function
 * caps at 250 MB. An API call is a few hundred milliseconds and Voyage's free
 * tier is 200 M tokens against a workload that uses a few thousand, so the
 * trade is worth it — and the deployment gets ~400 MB smaller.
 *
 * Swapping models means changing MODEL and EMBEDDING_DIM together and re-running
 * `seed:exercises`, because vectors from different models aren't comparable.
 * The dimension is also declared in the schema, so it needs a migration too.
 */

const MODEL = "voyage-4-lite";
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/** Voyage supports 2048/1024/512/256; 512 is ample for a catalogue this size. */
export const EMBEDDING_DIM = 512;

/** Voyage accepts at most 1,000 inputs per request. */
const MAX_BATCH = 128;

type VoyageResponse = {
  data: { embedding: number[]; index: number }[];
  usage?: { total_tokens: number };
};

/**
 * `input_type` matters for retrieval quality: Voyage prepends a different
 * instruction for stored documents than for search queries, so the two land in
 * compatible but appropriately-oriented parts of the space.
 */
export type EmbedKind = "document" | "query";

async function callVoyage(inputs: string[], kind: EmbedKind): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "VOYAGE_API_KEY is not set. Embeddings power program recommendations and exercise substitution — see DEPLOY.md.",
    );
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: inputs,
      model: MODEL,
      input_type: kind,
      output_dimension: EMBEDDING_DIM,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const body = (await response.json()) as VoyageResponse;

  // Voyage returns an index per embedding; don't assume response order.
  const ordered = new Array<number[]>(inputs.length);
  for (const item of body.data) ordered[item.index] = item.embedding;

  const missing = ordered.findIndex((v) => !v);
  if (missing !== -1) {
    throw new Error(`Voyage returned no embedding for input ${missing}`);
  }
  return ordered;
}

/** Returns unit-length vectors, so cosine distance is just `1 - dot`. */
export async function embed(
  texts: string[],
  kind: EmbedKind = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    out.push(...(await callVoyage(texts.slice(i, i + MAX_BATCH), kind)));
  }
  return out;
}

export async function embedOne(text: string, kind: EmbedKind = "document"): Promise<number[]> {
  const [vector] = await embed([text], kind);
  return vector;
}

/**
 * Embedding, but never fatal.
 *
 * A network blip or an expired key should degrade recommendation *ranking*, not
 * take the coach down. Callers treat null as "rank without similarity".
 */
export async function tryEmbedOne(
  text: string,
  kind: EmbedKind = "document",
): Promise<number[] | null> {
  try {
    return await embedOne(text, kind);
  } catch (error) {
    console.warn(
      "embeddings unavailable, falling back to filters only:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
