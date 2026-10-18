import type { Metadata } from "next";
import { connection } from "next/server";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { embeddings } from "@/db/schema";
import { AiBanner } from "@/components/AiBanner";
import { Nav } from "@/components/Nav";
import { embeddingsConfigured } from "@/lib/embeddings";
import { AskGlossary } from "./AskGlossary";

export const metadata: Metadata = { title: "Ask my glossary" };

export default async function AskPage() {
  await connection();
  const [{ value: indexed }] = await db.select({ value: count() }).from(embeddings);
  return (
    <>
      <Nav current="/ask" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ask my glossary</h1>
          <p className="mt-1 text-sm text-muted">
            Ask anything. Answers come only from your cards and course notes, with links to where each point came from.
          </p>
        </div>
        <AiBanner />
        {!embeddingsConfigured() && (
          <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            Search needs VOYAGE_API_KEY. See DEPLOY.md, Part 3.
          </p>
        )}
        <AskGlossary indexed={indexed} />
      </main>
    </>
  );
}
