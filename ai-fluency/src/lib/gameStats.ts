import { max } from "drizzle-orm";
import { db } from "@/db";
import { gameScores } from "@/db/schema";

/**
 * Personal bests, keyed "game" or "game:variant". Lives outside the server
 * actions file on purpose: everything exported from a "use server" file is
 * callable from the browser.
 */
export async function getBests(): Promise<Map<string, number>> {
  const rows = await db
    .select({ game: gameScores.game, variant: gameScores.variant, best: max(gameScores.score) })
    .from(gameScores)
    .groupBy(gameScores.game, gameScores.variant);
  const bests = new Map<string, number>();
  for (const r of rows) {
    if (r.best === null) continue;
    const key = r.variant ? `${r.game}:${r.variant}` : r.game;
    bests.set(key, r.best);
    bests.set(r.game, Math.max(bests.get(r.game) ?? 0, r.best));
  }
  return bests;
}
