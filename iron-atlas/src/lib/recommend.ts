import { and, asc, cosineDistance, desc, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  equipment as equipmentEnum,
  experienceLevel as levelEnum,
  goal as goalEnum,
  programs,
} from "@/db/schema";
import { tryEmbedOne } from "@/lib/embeddings";

/**
 * Hybrid retrieval: hard SQL filters decide what is *trainable*, embeddings
 * decide what is a good *fit*, and the model only writes the explanation.
 *
 * The split matters. A pure vector search will happily recommend a 6-day
 * program to someone who said they train twice a week, because "6 days" and
 * "2 days" are semantically close. A pure filter can't tell that "I like
 * high-volume arm work" points at Arnold rather than 5/3/1. Each half covers
 * the other's blind spot.
 */

export type TrainingProfile = {
  goal?: string;
  experienceLevel?: string;
  daysPerWeek?: number;
  availableEquipment?: string[];
  preferences?: string;
};

export type Recommendation = {
  slug: string;
  title: string;
  authorName: string;
  summary: string;
  goal: string;
  experienceLevel: string;
  daysPerWeek: number;
  weeks: number;
  splitType: string;
  tags: string[];
  equipmentRequired: string[];
  aiGenerated: boolean;
  verified: boolean;
  confidence: "documented" | "partial" | "stylistic" | null;
  firstParty: boolean;
  /** Cosine similarity against the profile, 0-1. Higher is a closer fit. */
  similarity: number;
  /** Which hard filters this program satisfied — shown so a pick is auditable. */
  matched: string[];
};

const isEnum = (values: readonly string[], v?: string) =>
  !!v && values.includes(v as never);

/** Text we embed to represent what the lifter is asking for. */
export function profileText(profile: TrainingProfile): string {
  return [
    profile.goal ? `goal: ${profile.goal.replace(/_/g, " ")}` : "",
    profile.experienceLevel ? `${profile.experienceLevel} lifter` : "",
    profile.daysPerWeek ? `training ${profile.daysPerWeek} days per week` : "",
    profile.availableEquipment?.length
      ? `equipment available: ${profile.availableEquipment.join(", ")}`
      : "",
    profile.preferences ?? "",
  ]
    .filter(Boolean)
    .join(". ");
}

export async function recommendPrograms(
  profile: TrainingProfile,
  limit = 4,
): Promise<Recommendation[]> {
  /**
   * Ordered most-important-first. Relaxation drops from the end, so the last
   * entry is the first to go: equipment is the most brittle constraint (a
   * program gets excluded over one accessory machine, which is exactly what
   * the substitution engine exists to fix), while goal and experience level
   * are the ones worth holding onto longest — a beginner should not be handed
   * an advanced block just to satisfy a gym inventory.
   */
  const constraints: { label: string; clause: SQL }[] = [];

  if (isEnum(goalEnum.enumValues, profile.goal)) {
    constraints.push({
      label: `goal: ${profile.goal!.replace(/_/g, " ")}`,
      clause: sql`${programs.goal} = ${profile.goal}`,
    });
  }

  if (isEnum(levelEnum.enumValues, profile.experienceLevel)) {
    constraints.push({
      label: `${profile.experienceLevel} level`,
      clause: sql`${programs.experienceLevel} = ${profile.experienceLevel}`,
    });
  }

  if (profile.daysPerWeek) {
    // Not exact: someone who says "3 days" can usually run a 4-day program,
    // and being rigid here empties the result set on a small library.
    constraints.push({
      label: `~${profile.daysPerWeek} days/week`,
      clause: sql`${programs.daysPerWeek} between ${profile.daysPerWeek - 1} and ${profile.daysPerWeek + 1}`,
    });
  }

  const equipment = profile.availableEquipment?.filter((e) =>
    isEnum(equipmentEnum.enumValues, e),
  );
  if (equipment?.length) {
    // Subset containment: everything the program needs must be something the
    // lifter actually has.
    constraints.push({
      label: "fits your equipment",
      // sql.raw here builds query text from `equipment`, not a bound
      // parameter — verified safe only because `equipment` was just filtered
      // through `isEnum` above, so every element is one of a fixed set of
      // enum values, never arbitrary text. (A parameterized rewrite was
      // tried and reverted: postgres.js binds a JS array as a row-tuple
      // `($1, $2)`, not a single array value, which `<@ (...)::equipment[]`
      // can't cast — Drizzle has no `arrayLiteral`/`<@`-aware helper for
      // this, so building the literal is the correct approach here, not a
      // shortcut.)
      clause: sql`${programs.equipmentRequired} <@ ${sql.raw(
        `array[${equipment.map((e) => `'${e}'`).join(",")}]::equipment[]`,
      )}`,
    });
  }

  // Null when the embedding model can't load. The hard filters still decide
  // what's trainable; only the "which of these fits best" ordering is lost.
  const vector = await tryEmbedOne(
    profileText(profile) || "general strength training",
    "query",
  );
  const similarity = vector
    ? sql<number>`1 - (${cosineDistance(programs.embedding, vector)})`
    : sql<number>`0::float`;
  // Without similarity, prefer human-verified programs and keep order stable.
  const ranking = vector
    ? [desc(similarity)]
    : [desc(programs.verified), asc(programs.title)];

  const select = {
    slug: programs.slug,
    title: programs.title,
    authorName: programs.authorName,
    summary: programs.summary,
    goal: programs.goal,
    experienceLevel: programs.experienceLevel,
    daysPerWeek: programs.daysPerWeek,
    weeks: programs.weeks,
    splitType: programs.splitType,
    tags: programs.tags,
    equipmentRequired: programs.equipmentRequired,
    aiGenerated: programs.aiGenerated,
    verified: programs.verified,
    confidence: programs.confidence,
    firstParty: programs.firstParty,
    similarity,
  };

  /**
   * Progressive relaxation. A library this small filters down to nothing
   * easily, but dropping every constraint at the first miss throws away good
   * information — "strength, 4 days, intermediate" is still a strong match
   * even once the equipment clause is gone. So shed one constraint at a time,
   * loosest first, and report exactly which ones survived. The model is told
   * what actually matched so it can't claim a fit it didn't get.
   */
  for (let kept = constraints.length; kept > 0; kept--) {
    const active = constraints.slice(0, kept);
    const rows = await db
      .select(select)
      .from(programs)
      .where(and(...active.map((c) => c.clause)))
      .orderBy(...ranking)
      .limit(limit);

    if (rows.length > 0) {
      const matched = active.map((c) => c.label);
      return rows.map((r) => ({ ...r, matched }));
    }
  }

  // Nothing satisfied even one constraint — fall back to pure semantic search
  // with an empty `matched`, which the model reads as "these are loose fits".
  const rows = await db
    .select(select)
    .from(programs)
    .orderBy(...ranking)
    .limit(limit);

  return rows.map((r) => ({ ...r, matched: [] }));
}
