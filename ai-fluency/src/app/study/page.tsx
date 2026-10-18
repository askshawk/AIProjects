import type { Metadata } from "next";
import { connection } from "next/server";
import { Nav } from "@/components/Nav";
import { getStudyQueue } from "@/lib/progress";
import { StudySession, type SessionCard } from "./StudySession";

export const metadata: Metadata = { title: "Study" };

export default async function StudyPage() {
  await connection();
  const queue = await getStudyQueue();
  const cards: SessionCard[] = queue.map(({ term, state, isNew }) => ({
    term,
    isNew,
    // Dates go to the client as strings; it rebuilds them for the interval preview.
    state: { ...state, dueAt: state.dueAt.toISOString() },
  }));

  return (
    <>
      <Nav current="/study" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <StudySession initial={cards} />
      </main>
    </>
  );
}
