import type { Metadata } from "next";
import { connection } from "next/server";
import { AiBanner } from "@/components/AiBanner";
import { Nav } from "@/components/Nav";
import { topicsOf } from "@/lib/content";
import { PERSONAS } from "@/lib/personas";
import { getAllTerms } from "@/lib/terms";
import { LiveCalls } from "./LiveCalls";

export const metadata: Metadata = { title: "Live calls" };

export default async function LivePage() {
  // Reads your own cards from the database, so render per request, not at build time.
  await connection();
  const terms = await getAllTerms();
  const personas = PERSONAS.map(({ id, name, role, blurb }) => ({ id, name, role, blurb }));
  return (
    <>
      <Nav current="/practice" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <AiBanner />
        <LiveCalls personas={personas} topics={topicsOf(terms).map((t) => t.topic)} />
      </main>
    </>
  );
}
