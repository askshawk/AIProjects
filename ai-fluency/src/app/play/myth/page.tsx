import type { Metadata } from "next";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { getAllTerms } from "@/lib/terms";
import { MythOrFact } from "./MythOrFact";

export const metadata: Metadata = { title: "Myth or Fact" };

export default async function MythPage() {
  // Reads your own cards from the database, so render per request, not at build time.
  await connection();
  const terms = await getAllTerms();
  const pool = terms.map((t) => ({
    id: t.id,
    term: t.term,
    myth: t.misconception.claim,
    fact: t.misconception.truth,
  }));
  return (
    <>
      <Nav current="/play" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <MythOrFact pool={pool} />
      </main>
    </>
  );
}
