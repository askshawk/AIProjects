import { cache } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { customTerms } from "@/db/schema";
import { TERMS, type Term } from "./content";

/**
 * Built-in cards plus the ones you approved from your own notes. Cached per
 * request, so a page that asks several times hits the database once.
 */
export const getAllTerms = cache(async (): Promise<Term[]> => {
  const rows = await db.select().from(customTerms).orderBy(asc(customTerms.createdAt));
  const builtIn = new Set(TERMS.map((t) => t.id));
  // A custom card can never shadow a built-in one.
  return [...TERMS, ...rows.map((r) => r.data).filter((t) => !builtIn.has(t.id))];
});

export async function findTerm(id: string): Promise<Term | undefined> {
  return (await getAllTerms()).find((t) => t.id === id);
}
