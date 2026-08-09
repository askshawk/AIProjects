"use client";

// Empty states with a bit of character (B5).
//
// Most of this game's panels are empty on day one, and a row of grey "nothing
// here" lines makes a new city feel broken rather than new. Each one now gets
// a glyph, a line of Roman-flavoured copy, and — where there's an obvious next
// move — a link that pulses gently until the player takes it.

import Link from "next/link";

export default function EmptyState({
  glyph,
  children,
  action,
  compact,
}: {
  glyph: string;
  children: React.ReactNode;
  action?: { href: string; label: string };
  compact?: boolean;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      <span className="es-glyph" aria-hidden>{glyph}</span>
      <p className="es-text muted">{children}</p>
      {action && (
        <Link className="es-action" href={action.href}>
          {action.label} →
        </Link>
      )}
    </div>
  );
}
