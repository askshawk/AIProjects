/**
 * The provenance badge. Every library program says whether a human checked it,
 * because the library is reconstructed by a model and pretending otherwise
 * would be the single most misleading thing this app could do.
 */
export function ProvenanceBadge({
  aiGenerated,
  verified,
}: {
  aiGenerated: boolean;
  verified: boolean;
}) {
  if (verified) {
    return (
      <span className="rounded border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
        Verified
      </span>
    );
  }
  if (aiGenerated) {
    return (
      <span
        className="rounded border border-amber-800 bg-amber-950/50 px-2 py-0.5 text-[11px] font-medium text-amber-300"
        title="Reconstructed by an AI from its knowledge of this program — check it against the source before trusting the details."
      >
        AI-reconstructed
      </span>
    );
  }
  return null;
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-surface-raised px-2 py-0.5 text-[11px] capitalize text-muted">
      {children}
    </span>
  );
}
