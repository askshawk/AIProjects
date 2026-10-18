import type { Metadata } from "next";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { getAllProgress } from "@/lib/progress";
import { getAllTerms } from "@/lib/terms";
import { stageOf } from "@/lib/srs";
import { Glossary } from "./Glossary";

export const metadata: Metadata = { title: "Glossary" };

export default async function TermsPage() {
  await connection();
  const [terms, progress] = await Promise.all([getAllTerms(), getAllProgress()]);
  const entries = terms.map((t) => ({
    id: t.id,
    term: t.term,
    aka: t.aka ?? [],
    track: t.track,
    topic: t.topic,
    plain: t.plain,
    stage: stageOf(progress.get(t.id)),
    custom: Boolean(t.custom),
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
