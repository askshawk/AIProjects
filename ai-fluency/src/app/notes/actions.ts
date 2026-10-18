"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customTerms, notes } from "@/db/schema";
import { tryAi } from "@/lib/ai";
import { requireSignedIn } from "@/lib/auth";
import { extractCards, type DraftCard } from "@/lib/coach";
import { COURSES } from "@/lib/courses";
import type { Term } from "@/lib/content";
import { noteItems, removeFromIndex, removeNoteFromIndex, termItem, tryIndex } from "@/lib/embeddings";
import { MAX_NOTES_CHARS } from "@/lib/limits";
import { getAllTerms } from "@/lib/terms";

export async function extractFromNotes(input: { title: string; course: string; body: string }) {
  await requireSignedIn();
  const title = String(input.title ?? "").trim().slice(0, 120) || "Untitled notes";
  const course = COURSES.includes(input.course) ? input.course : "Other";
  const body = String(input.body ?? "").trim();
  if (body.length < 200) return { ok: false as const, error: "Paste at least a paragraph or two of notes." };
  if (body.length > MAX_NOTES_CHARS) return { ok: false as const, error: "That's a lot at once. Split it into smaller pieces (under 30,000 characters)." };

  // Save the notes first: they're searchable in Ask my glossary even if no cards come out.
  const [note] = await db.insert(notes).values({ title, course, body }).returning();
  await tryIndex(noteItems(note));

  const existing = await getAllTerms();
  const result = await tryAi(() => extractCards(body, course, existing));
  revalidatePath("/notes");
  if (!result.ok) return { ...result, noteId: note.id };
  return { ok: true as const, noteId: note.id, drafts: result.data };
}

const ApprovedSchema = z.object({
  term: z.string().trim().min(1).max(80),
  short: z.string().trim().min(1).max(120),
  aka: z.array(z.string().trim().min(1).max(60)).max(5),
  track: z.enum(["fundamentals", "sales-cs"]),
  topic: z.string().trim().min(1).max(60),
  plain: z.string().trim().min(1).max(800),
  technical: z.string().trim().min(1).max(1200),
  customerLine: z.string().trim().min(1).max(500),
  followUp: z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(800) }),
  misconception: z.object({ claim: z.string().trim().min(1).max(300), truth: z.string().trim().min(1).max(500) }),
});

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "card"
  );
}

/** Saves one draft (possibly edited) as your own card. */
export async function approveCard(draft: DraftCard, noteId: number) {
  await requireSignedIn();
  const parsed = ApprovedSchema.safeParse(draft);
  if (!parsed.success) return { ok: false as const, error: "Every field needs some text before saving." };

  const [note] = await db.select().from(notes).where(eq(notes.id, Number(noteId)));
  const existing = new Set((await getAllTerms()).map((t) => t.id));
  let id = `my-${slugify(parsed.data.term)}`;
  for (let n = 2; existing.has(id); n++) id = `my-${slugify(parsed.data.term)}-${n}`;

  const term: Term = {
    id,
    ...parsed.data,
    related: [],
    sources: [],
    status: "approved",
    custom: { course: note?.course ?? "Other", noteId: note?.id },
  };
  await db.insert(customTerms).values({ id, data: term });
  await tryIndex([termItem(term)]);
  revalidatePath("/notes");
  revalidatePath("/terms");
  return { ok: true as const, id };
}

export async function deleteCustomCard(id: string) {
  await requireSignedIn();
  await db.delete(customTerms).where(eq(customTerms.id, String(id)));
  await removeFromIndex(`term:${id}`);
  revalidatePath("/notes");
  revalidatePath("/terms");
}

export async function deleteNote(id: number) {
  await requireSignedIn();
  await db.delete(notes).where(eq(notes.id, Number(id)));
  await removeNoteFromIndex(Number(id));
  revalidatePath("/notes");
}
