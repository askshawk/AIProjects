"use server";

import { count } from "drizzle-orm";
import { db } from "@/db";
import { embeddings } from "@/db/schema";
import { aiStatus, tryAi } from "@/lib/ai";
import { requireSignedIn } from "@/lib/auth";
import { answerFromSnippets } from "@/lib/coach";
import { allIndexItems, embeddingsConfigured, searchIndex, syncIndex } from "@/lib/embeddings";
import { MAX_QUESTION_CHARS } from "@/lib/limits";

/** Below this similarity a snippet is noise, not evidence. */
const MIN_SIMILARITY = 0.3;

export async function askGlossary(question: string) {
  await requireSignedIn();
  const q = String(question ?? "").trim().slice(0, MAX_QUESTION_CHARS);
  if (q.length < 3) return { ok: false as const, error: "Ask a question first." };
  if (!embeddingsConfigured()) return { ok: false as const, error: "Search isn't set up: VOYAGE_API_KEY is missing." };
  const status = aiStatus();
  if (!status.available) return { ok: false as const, error: status.reason };

  const [{ value: indexed }] = await db.select({ value: count() }).from(embeddings);
  if (indexed === 0) return { ok: false as const, error: "The search index is empty. Build it below, or redeploy." };

  let hits;
  try {
    hits = (await searchIndex(q, 6)).filter((h) => h.similarity >= MIN_SIMILARITY);
  } catch {
    return { ok: false as const, error: "Search is unavailable right now (Voyage didn't respond). Try again shortly." };
  }
  if (hits.length === 0) {
    return { ok: true as const, answer: { answer: "Nothing in your cards or notes covers that yet.", citations: [], grounded: false, followUps: [] }, sources: [] };
  }

  const result = await tryAi(() => answerFromSnippets(q, hits));
  if (!result.ok) return result;
  const sources = hits.map((h, i) => ({
    n: i + 1,
    title: h.title,
    href: h.kind === "term" ? `/terms/${h.refId}` : "/notes",
    kind: h.kind,
  }));
  return { ok: true as const, answer: result.data, sources };
}

/** For a fresh local database: embeds every card and note. Production does this on deploy. */
export async function buildIndex() {
  await requireSignedIn();
  if (!embeddingsConfigured()) return { ok: false as const, error: "VOYAGE_API_KEY is missing." };
  try {
    const { embedded } = await syncIndex(await allIndexItems(), { prune: true });
    return { ok: true as const, embedded };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message.slice(0, 200) : "Indexing failed." };
  }
}
