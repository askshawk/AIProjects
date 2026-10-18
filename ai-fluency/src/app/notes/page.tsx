import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { customTerms, notes } from "@/db/schema";
import { AiBanner } from "@/components/AiBanner";
import { Nav } from "@/components/Nav";
import { COURSES } from "@/lib/courses";
import { topicsOf } from "@/lib/content";
import { getAllTerms } from "@/lib/terms";
import { NotesToCards } from "./NotesToCards";
import { DeleteButton } from "./DeleteButton";
import { deleteCustomCard, deleteNote } from "./actions";

export const metadata: Metadata = { title: "Course notes" };

export default async function NotesPage() {
  await connection();
  const [noteRows, cardRows, terms] = await Promise.all([
    db.select().from(notes).orderBy(desc(notes.createdAt)),
    db.select().from(customTerms).orderBy(desc(customTerms.createdAt)),
    getAllTerms(),
  ]);

  return (
    <>
      <Nav current="/" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Course notes</h1>
          <p className="mt-1 text-sm text-muted">
            Paste notes from Microsoft Learn, Anthropic Academy, DeepLearning.AI, or anywhere else. Claude drafts cards for
            new terms; you edit and approve each one before it joins your study queue. Your notes also become searchable in{" "}
            <Link href="/ask" className="text-accent underline-offset-4 hover:underline">
              Ask my glossary
            </Link>
            .
          </p>
        </div>
        <AiBanner />
        <NotesToCards courses={COURSES} topics={topicsOf(terms).map((t) => t.topic)} />

        <section>
          <h2 className="font-medium">Your cards ({cardRows.length})</h2>
          {cardRows.length === 0 ? (
            <p className="mt-1 text-sm text-muted">None yet. Approved cards show up here and in the glossary.</p>
          ) : (
            <ul className="mt-2 divide-y rounded-2xl border bg-surface">
              {cardRows.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <Link href={`/terms/${c.id}`} className="hover:text-accent">
                    <span className="font-medium">{c.data.term}</span>
                    <span className="block text-xs text-muted">{c.data.custom?.course}</span>
                  </Link>
                  <DeleteButton action={deleteCustomCard.bind(null, c.id)} label={`Delete card ${c.data.term}`} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-medium">Saved notes ({noteRows.length})</h2>
          {noteRows.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nothing saved yet.</p>
          ) : (
            <ul className="mt-2 divide-y rounded-2xl border bg-surface">
              {noteRows.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <span className="font-medium">{n.title}</span>
                    <span className="block text-xs text-muted">
                      {n.course} · {n.body.length.toLocaleString()} characters
                    </span>
                  </span>
                  <DeleteButton action={deleteNote.bind(null, n.id)} label={`Delete notes ${n.title}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
