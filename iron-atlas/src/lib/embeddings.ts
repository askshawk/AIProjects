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

/**
 * Voyage's free tier — no payment method on file — allows 3 requests and
 * 10K tokens per minute, and answers 429 once either is exceeded. Backfilling
 * a whole library crosses that immediately, so retry rather than abort: the
 * work is a one-off batch where waiting is free and losing the run is not.
 */
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 20_000;

/**
 * Batches are capped by estimated *tokens*, not just item count. The free
 * tier's 10K-tokens-per-minute limit applies per request, so a 128-item batch
 * of program summaries (~16K tokens) would 429 forever — no amount of waiting
 * makes an over-large request fit. Roughly 4 characters per token.
 */
const MAX_BATCH_TOKENS = 7_000;
const CHARS_PER_TOKEN = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    const err = new Error(
      `Voyage embeddings failed (${response.status}): ${detail.slice(0, 300)}`,
    );
    // 429 is rate limiting and 5xx is transient; both are worth waiting out.
    // Everything else (401, 400) will fail identically on retry.
    const retryable = response.status === 429 || response.status >= 500;
    throw Object.assign(err, {
      retryable,
      retryAfter: Number(response.headers.get("retry-after")) || undefined,
    });
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
  { retry = true }: { retry?: boolean } = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (const batch of batches(texts)) {
    const call = () => callVoyage(batch, kind);
    out.push(...(retry ? await withRetry(call) : await call()));
  }
  return out;
}

/** Splits inputs so no request exceeds either the item or the token cap. */
function* batches(texts: string[]): Generator<string[]> {
  let current: string[] = [];
  let tokens = 0;

  for (const text of texts) {
    const cost = Math.ceil(text.length / CHARS_PER_TOKEN);
    const wouldOverflow = current.length >= MAX_BATCH || tokens + cost > MAX_BATCH_TOKENS;
    if (current.length > 0 && wouldOverflow) {
      yield current;
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += cost;
  }

  if (current.length > 0) yield current;
}

/** Waits out rate limits rather than losing a long backfill to one 429. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { retryable?: boolean; retryAfter?: number };
      if (!e.retryable || attempt >= MAX_RETRIES) throw err;
      // Honour Retry-After when the server sends one; otherwise back off
      // linearly from a minute-scale base, since the limit resets per minute.
      const waitMs = e.retryAfter ? e.retryAfter * 1000 : BASE_BACKOFF_MS * (attempt + 1);
      console.warn(
        `  rate limited by Voyage, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(waitMs);
    }
  }
}

export async function embedOne(text: string, kind: EmbedKind = "document"): Promise<number[]> {
  const [vector] = await embed([text], kind);
  return vector;
}

/**
 * One embedding with no retry. Used by the never-fatal path: waiting out a
 * rate limit is right for an offline backfill and wrong for a request someone
 * is sitting in front of — a coach reply should fall back to filter-only
 * ranking immediately rather than stalling for a minute.
 */
async function embedFast(text: string, kind: EmbedKind): Promise<number[]> {
  const [vector] = await embed([text], kind, { retry: false });
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
    return await embedFast(text, kind);
  } catch (error) {
    console.warn(
      "embeddings unavailable, falling back to filters only:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
