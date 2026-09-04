import Link from "next/link";
import { notAffiliatedWith } from "@/lib/disclosure";

export const metadata = {
  title: "About",
  description:
    "How Iron Atlas's library gets built, what an AI reconstruction means, and what isn't claimed about the coaches whose methods appear in it.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">About</h1>

      <div className="space-y-3 text-sm leading-relaxed text-muted">
        <p>
          Iron Atlas is a library of lifting programs, rebuilt by an AI from
          its knowledge of published training methods, then adapted to the
          equipment your gym actually has. It&apos;s a personal project, not
          a business — built to learn, and to be genuinely useful to train
          from.
        </p>
        <p>
          Every program in the library is an{" "}
          <span className="text-foreground">independent reconstruction</span>
          , not a copy of anyone&apos;s original document, PDF, or book.
          Sets, reps, exercise order, and percentages aren&apos;t the kind of
          thing copyright protects — they&apos;re a training method, not a
          text — but the specific prose, tables, and branding a coach
          publishes are theirs, and none of that is reproduced here.
        </p>
        <p>
          {notAffiliatedWith("any coach whose method appears in the library")}{" "}
          Where a coach actively sells the real thing, the program page links
          to it — buying the original is always the better way to get their
          actual work.
        </p>
        <p>
          Some programs carry a coach&apos;s name because that&apos;s who
          publicized the method; others are Iron Atlas&apos; own
          programming and carry no coach&apos;s name at all. Every program
          page says which, and how much confidence the reconstruction
          deserves.
        </p>
        <p>
          See the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms
          </Link>{" "}
          for the fuller legal picture, including how to request a takedown.
        </p>
      </div>
    </div>
  );
}
