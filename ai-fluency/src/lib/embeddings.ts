import { createHash } from "node:crypto";
import { cosineDistance, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { EMBEDDING_DIM, embeddings, notes } from "@/db/schema";
import type { Term } from "./content";
import { getAllTerms } from "./terms";

/**
 * The search index behind "Ask my glossary": every card and every chunk of
 * your notes is embedded with Voyage (the same provider and model family as
 * iron-atlas) and stored in pgvector. A question is embedded the same way and
 * matched by cosine similarity.
 */

const MODEL = "voyage-4-lite";
// Overridable so tests can point at a local stand-in (like ANTHROPIC_BASE_URL for Claude).
const ENDPOINT = `${process.env.VOYAGE_BASE_URL ?? "https://api.voyageai.com"}/v1/embeddings`;
/** Voyage's free tier allows 10K tokens a minute; keep each request well under. */
const MAX_BATCH_TOKENS = 7_000;
const CHARS_PER_TOKEN = 4;
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 20_000;
/** Notes are split into chunks of about this many characters. */
const CHUNK_CHARS = 1_200;

type Kind = "document" | "query";

export function embeddingsConfigured(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callVoyage(inputs: string[], kind: Kind): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set. Ask my glossary needs it; see DEPLOY.md.");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: inputs, model: MODEL, input_type: kind, output_dimension: EMBEDDING_DIM }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`Voyage embeddings failed (${response.status}): ${detail.slice(0, 300)}`), {
      retryable: response.status === 429 || response.status >= 500,
      retryAfter: Number(response.headers.get("retry-after")) || undefined,
    });
  }
  const body = (await response.json()) as { data: { embedding: number[]; index: number }[] };
  // Voyage returns an index per embedding; don't assume response order.
  const ordered = new Array<number[]>(inputs.length);
  for (const item of body.data) ordered[item.index] = item.embedding;
  if (ordered.some((v) => !v)) throw new Error("Voyage returned fewer embeddings than inputs");
  return ordered;
}

function* batches(texts: string[]): Generator<string[]> {
  let current: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const cost = Math.ceil(text.length / CHARS_PER_TOKEN);
    if (current.length > 0 && (current.length >= 128 || tokens + cost > MAX_BATCH_TOKENS)) {
      yield current;
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += cost;
  }
  if (current.length) yield current;
}

/**
 * With retry for one-off batch jobs (the deploy-time sync), where waiting out
 * a rate limit is free; without it for requests someone is waiting on.
 */
export async function embed(texts: string[], kind: Kind, { retry = false } = {}): Promise<number[][]> {
  const out: number[][] = [];
  for (const batch of batches(texts)) {
    for (let attempt = 0; ; attempt++) {
      try {
        out.push(...(await callVoyage(batch, kind)));
        break;
      } catch (err) {
        const e = err as { retryable?: boolean; retryAfter?: number };
        if (!retry || !e.retryable || attempt >= MAX_RETRIES) throw err;
        const wait = e.retryAfter ? e.retryAfter * 1000 : BASE_BACKOFF_MS * (attempt + 1);
        console.warn(`  rate limited by Voyage, waiting ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }
    }
  }
  return out;
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export type IndexItem = { key: string; kind: "term" | "note"; refId: string; title: string; content: string };

export function termItem(t: Term): IndexItem {
  const content = [
    `${t.term}${t.aka?.length ? ` (also: ${t.aka.join(", ")})` : ""}: ${t.plain}`,
    t.technical,
    `Customer line: ${t.customerLine}`,
    `Follow-up: ${t.followUp.q} ${t.followUp.a}`,
    `Myth: ${t.misconception.claim} Fact: ${t.misconception.truth}`,
  ].join("\n");
  return { key: `term:${t.id}`, kind: "term", refId: t.id, title: t.term, content };
}

/** Splits notes on paragraph breaks into chunks of roughly CHUNK_CHARS. */
export function chunkNote(body: string): string[] {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > CHUNK_CHARS) {
      chunks.push(current);
      current = "";
    }
    // A single huge paragraph gets hard-split.
    for (let i = 0; i < p.length; i += CHUNK_CHARS) {
      const piece = p.slice(i, i + CHUNK_CHARS);
      current = current ? `${current}\n\n${piece}` : piece;
      if (current.length >= CHUNK_CHARS) {
        chunks.push(current);
        current = "";
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function noteItems(note: { id: number; title: string; course: string; body: string }): IndexItem[] {
  return chunkNote(note.body).map((content, i) => ({
    key: `note:${note.id}:${i}`,
    kind: "note",
    refId: String(note.id),
    title: `${note.title} (${note.course} notes)`,
    content,
  }));
}

/** Embeds whatever is new or changed, and removes entries for things that no longer exist. */
export async function syncIndex(items: IndexItem[], { retry = false, prune = false } = {}) {
  const existing = await db.select({ key: embeddings.key, contentHash: embeddings.contentHash }).from(embeddings);
  const known = new Map(existing.map((e) => [e.key, e.contentHash]));
  const stale = items.filter((i) => known.get(i.key) !== hash(i.content));

  if (stale.length) {
    const vectors = await embed(stale.map((i) => i.content), "document", { retry });
    for (const [n, item] of stale.entries()) {
      const row = { ...item, contentHash: hash(item.content), embedding: vectors[n] };
      await db.insert(embeddings).values(row).onConflictDoUpdate({ target: embeddings.key, set: row });
    }
  }

  let removed = 0;
  if (prune) {
    const wanted = new Set(items.map((i) => i.key));
    const gone = existing.map((e) => e.key).filter((k) => !wanted.has(k));
    if (gone.length) await db.delete(embeddings).where(inArray(embeddings.key, gone));
    removed = gone.length;
  }
  return { embedded: stale.length, removed };
}

/** Everything that should be in the index right now. */
export async function allIndexItems(): Promise<IndexItem[]> {
  const [terms, noteRows] = await Promise.all([getAllTerms(), db.select().from(notes)]);
  return [...terms.map(termItem), ...noteRows.flatMap(noteItems)];
}

/** Best-effort indexing after a save; the deploy-time sync catches anything missed. */
export async function tryIndex(items: IndexItem[]) {
  if (!embeddingsConfigured()) return;
  try {
    await syncIndex(items);
  } catch (error) {
    console.warn("indexing skipped:", error instanceof Error ? error.message : error);
  }
}

export async function removeFromIndex(key: string) {
  await db.delete(embeddings).where(eq(embeddings.key, key));
}

export async function removeNoteFromIndex(noteId: number) {
  await db.delete(embeddings).where(eq(embeddings.refId, String(noteId)));
}

export async function searchIndex(question: string, limit = 6) {
  const [vector] = await embed([question], "query");
  const similarity = sql<number>`1 - (${cosineDistance(embeddings.embedding, vector)})`;
  return db
    .select({ key: embeddings.key, kind: embeddings.kind, refId: embeddings.refId, title: embeddings.title, content: embeddings.content, similarity })
    .from(embeddings)
    .orderBy(desc(similarity))
    .limit(limit);
}
