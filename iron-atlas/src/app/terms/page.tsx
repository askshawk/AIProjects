import Link from "next/link";

export const metadata = { title: "Terms · Iron Atlas" };

const ISSUES_URL = "https://github.com/askshawk/AIProjects/issues/new";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Terms</h1>
        <p className="mt-1 text-sm text-muted">
          Plain-language terms for a personal project. See{" "}
          <Link href="/about" className="text-accent hover:underline">
            About
          </Link>{" "}
          for what Iron Atlas is and how the library is built.
        </p>
      </div>

      <Section title="No affiliation">
        <p>
          Iron Atlas is not affiliated with, endorsed by, sponsored by, or
          operated on behalf of any coach, author, or brand named in the
          library. Coach names are used only to describe where a training
          method came from.
        </p>
      </Section>

      <Section title="What the programs are">
        <p>
          Every program is an AI reconstruction of a published training
          method — rebuilt from what the model knows, not transcribed from
          or copied out of a coach&apos;s original document, PDF, book, or
          paid product. Reconstructions vary in how closely they match the
          source; each program page states its confidence level and, where
          applicable, links to where the source and the real thing can be
          bought.
        </p>
        <p>
          Nothing here should be treated as a verified, authoritative copy
          of any coach&apos;s actual published program. Check a
          reconstruction against the original source before relying on it.
        </p>
      </Section>

      <Section title="Medical disclaimer">
        <p>
          Iron Atlas is not medical or professional fitness advice. Strength
          training carries a real risk of injury. Talk to a doctor before
          starting a new training program, especially if you have an
          existing injury or health condition, and stop any exercise that
          causes pain.
        </p>
      </Section>

      <Section title="No warranty">
        <p>
          Iron Atlas is provided &quot;as is,&quot; with no warranty of any
          kind. Set and rep numbers, exercise substitutions, and AI-written
          coaching output may be wrong. You&apos;re responsible for how you
          use it.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Use Iron Atlas for your own training. Don&apos;t use it to
          represent any reconstruction as a coach&apos;s official or
          verified program, and don&apos;t use the site to redistribute a
          coach&apos;s actual copyrighted materials.
        </p>
      </Section>

      <Section title="Takedown requests">
        <p>
          If you&apos;re a coach or rights holder and want a program removed
          or corrected — including a source link that shouldn&apos;t be
          there — open an issue and mention Iron Atlas:
        </p>
        <p>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            {ISSUES_URL}
          </a>
        </p>
      </Section>
    </div>
  );
}
