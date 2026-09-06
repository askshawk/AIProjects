import { sql, type SQL } from "drizzle-orm";
import { programs } from "@/db/schema";
import type { Equipment } from "@/lib/substitute";

/**
 * How well a program matches the gym someone actually trains in.
 *
 * The substitution engine is the thing Iron Atlas does that other program
 * libraries don't, and until now it only revealed itself *after* you opened a
 * program. Surfacing it while browsing turns an invisible strength into the
 * reason to pick one program over another.
 *
 * This deliberately compares the program's `equipmentRequired` array rather
 * than running the substitution engine per card: the engine costs several
 * vector queries per exercise, which is far too much for 24 cards a page. The
 * trade is that this answers "does this need adapting?" rather than "how many
 * swaps exactly?" — which is the question that matters while browsing anyway.
 */
export type GymFit =
  /** No gym saved, so there's nothing to compare against. */
  | { kind: "unknown" }
  /** Runs exactly as written. */
  | { kind: "fits" }
  /** Runnable, but some movements will be substituted. */
  | { kind: "adapts"; missing: Equipment[] };

export function gymFit(
  equipmentRequired: string[] | null | undefined,
  gymEquipment: Equipment[],
): GymFit {
  if (gymEquipment.length === 0) return { kind: "unknown" };
  if (!equipmentRequired || equipmentRequired.length === 0) {
    return { kind: "fits" };
  }

  const have = new Set<string>(gymEquipment);
  const missing = equipmentRequired.filter((e) => !have.has(e)) as Equipment[];
  return missing.length === 0 ? { kind: "fits" } : { kind: "adapts", missing };
}

/**
 * SQL for "this program needs nothing my gym doesn't have".
 *
 * Each element is bound as its own parameter rather than being formatted into
 * the query text — the values are enum-validated upstream, but a containment
 * check is easy to write as string concatenation and that's a landmine worth
 * not leaving lying around.
 */
export function fitsGymClause(gymEquipment: Equipment[]): SQL {
  const values = sql.join(
    gymEquipment.map((e) => sql`${e}`),
    sql`, `,
  );
  return sql`${programs.equipmentRequired} <@ array[${values}]::equipment[]`;
}
