import type { Term } from "@/lib/content";

/** The answer side of a card. Shared by study sessions and term pages. */
export function TermBody({ term }: { term: Term }) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Plain English</h3>
        <p className="mt-1">{term.plain}</p>
      </section>

      <section className="rounded-xl bg-accent-soft p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Say it to a customer</h3>
        <p className="mt-1">&ldquo;{term.customerLine}&rdquo;</p>
      </section>

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Likely follow-up: <span className="font-normal italic">{term.followUp.q}</span>
        </summary>
        <p className="mt-2 text-sm">{term.followUp.a}</p>
      </details>

      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm font-medium">Under the hood</summary>
        <p className="mt-2 text-sm">{term.technical}</p>
      </details>

      <section className="text-sm">
        <p>
          <span className="font-semibold text-bad">Myth:</span> {term.misconception.claim}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-good">Fact:</span> {term.misconception.truth}
        </p>
      </section>
    </div>
  );
}
