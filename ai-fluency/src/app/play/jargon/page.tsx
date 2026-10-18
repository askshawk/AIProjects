import type { Metadata } from "next";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { JARGON } from "@/lib/games";
import { getAllTerms } from "@/lib/terms";
import { JargonBuster } from "./JargonBuster";

export const metadata: Metadata = { title: "Jargon Buster" };

export default async function JargonPage() {
  // Reads your own cards from the database, so render per request, not at build time.
  await connection();
  const terms = await getAllTerms();
  const byId = new Map(terms.map((t) => [t.id, t]));
  const sentences = JARGON.map((s) => ({
    ...s,
    terms: s.termIds.flatMap((id) => {
      const t = byId.get(id);
      return t ? [{ id: t.id, term: t.term, short: t.short }] : [];
    }),
  }));

  return (
    <>
      <Nav current="/play" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <JargonBuster sentences={sentences} />
      </main>
    </>
  );
}
