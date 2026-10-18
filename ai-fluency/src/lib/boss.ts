import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roleplaySessions } from "@/db/schema";
import { topicsOf, type Track } from "./content";
import { getAllProgress } from "./progress";
import { stageOf } from "./srs";
import { getAllTerms } from "./terms";

/** A topic's boss unlocks once this share of its cards is mastered. */
export const BOSS_UNLOCK_SHARE = 0.5;
export const BOSS_WIN_SCORE = 80;
export const LIVE_WIN_SCORE = 70;

export type BossUnit = {
  track: Track;
  topic: string;
  total: number;
  mastered: number;
  needed: number;
  unlocked: boolean;
  defeated: boolean;
  bestScore: number | null;
};

export async function bossStatus(): Promise<BossUnit[]> {
  const [terms, progress, sessions] = await Promise.all([
    getAllTerms(),
    getAllProgress(),
    db.select().from(roleplaySessions).where(eq(roleplaySessions.mode, "boss")),
  ]);
  return topicsOf(terms).map(({ track, topic }) => {
    const cards = terms.filter((t) => t.topic === topic);
    const mastered = cards.filter((c) => stageOf(progress.get(c.id)) === "mastered").length;
    const needed = Math.max(1, Math.ceil(cards.length * BOSS_UNLOCK_SHARE));
    const fights = sessions.filter((s) => s.topic === topic);
    return {
      track,
      topic,
      total: cards.length,
      mastered,
      needed,
      unlocked: mastered >= needed,
      defeated: fights.some((f) => f.won === 1),
      bestScore: fights.length ? Math.max(...fights.map((f) => f.score)) : null,
    };
  });
}
