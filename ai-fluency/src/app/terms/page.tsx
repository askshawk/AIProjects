import type { Metadata } from "next";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { TERMS } from "@/lib/content";
import { getAllProgress } from "@/lib/progress";
import { stageOf } from "@/lib/srs";
import { Glossary } from "./Glossary";

export const metadata: Metadata = { title: "Glossary" };

export default async function TermsPage() {
  await connection();
  const progress = await getAllProgress();
  const entries = TERMS.map((t) => ({
    id: t.id,
    term: t.term,
    aka: t.aka ?? [],
    track: t.track,
    topic: t.topic,
    plain: t.plain,
    stage: stageOf(progress.get(t.id)),
  }));

  return (
    <>
      <Nav current="/terms" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <Glossary entries={entries} />
      </main>
    </>
  );
}
