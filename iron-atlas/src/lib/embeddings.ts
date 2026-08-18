import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

/**
 * Embeddings run locally on CPU via transformers.js. all-MiniLM-L6-v2 is small
 * (~23M params), fast enough to embed the whole catalogue in seconds, and needs
 * no API key — which matters because Anthropic has no embeddings endpoint.
 *
 * Swapping models means changing MODEL_ID and EMBEDDING_DIM together and
 * re-running the seed, since existing vectors would no longer be comparable.
 */
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Keep the weights inside the project so a fresh clone doesn't rely on a warm
// global HF cache, and the download happens once.
env.cacheDir = "./.models";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

function getExtractor() {
  extractor ??= pipeline("feature-extraction", MODEL_ID);
  return extractor;
}

/** Returns unit-length vectors, so cosine distance is just `1 - dot`. */
export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const fe = await getExtractor();
  const output = await fe(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}
