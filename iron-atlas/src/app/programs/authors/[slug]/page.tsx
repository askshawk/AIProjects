import Link from "next/link";
import { notFound } from "next/navigation";
import { findAuthorName, programsByAuthor } from "@/lib/authors";
import { notAffiliatedWith } from "@/lib/disclosure";
import { ProgramCard } from "@/components/ProgramCard";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const name = await findAuthorName(slug);
  if (!name) return { title: "Not found" };
  return {
    title: name,
    description: `Every program in the library built on ${name}'s published training method.`,
  };
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const name = await findAuthorName(slug);
  if (!name) notFound();

  const rows = await programsByAuthor(name);
  const verified = rows.filter((p) => p.verified).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/programs/authors"
          className="text-sm text-muted hover:text-foreground"
        >
          ← All coaches
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} program{rows.length === 1 ? "" : "s"} in the library
          {verified > 0 && ` · ${verified} verified`}
        </p>
        {name !== "Iron Atlas" && (
          <p className="mt-2 max-w-2xl text-xs text-muted">
            {notAffiliatedWith(name)} These are AI reconstructions of their
            published training methods, not their own writing.
          </p>
        )}
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((p) => (
          <li key={p.id}>
            <ProgramCard program={p} showAuthor={false} />
          </li>
        ))}
      </ul>
    </div>
  );
}
