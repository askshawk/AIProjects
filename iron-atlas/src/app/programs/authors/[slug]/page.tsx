import Link from "next/link";
import { notFound } from "next/navigation";
import { findAuthorName, programsByAuthor } from "@/lib/authors";
import { ProgramCard } from "@/components/ProgramCard";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const name = await findAuthorName(slug);
  return { title: name ? `${name} · Iron Atlas` : "Not found · Iron Atlas" };
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
        <Link href="/programs/authors" className="text-sm text-muted hover:text-foreground">
          ← All coaches
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} program{rows.length === 1 ? "" : "s"} in the library
          {verified > 0 && ` · ${verified} verified`}
        </p>
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
