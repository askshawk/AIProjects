// A gilded, meander-underlined page header — the classical "plaque" that names
// the current city/view (echoes Grepolis's ornamental city banner).

// The painted laurel header banner (art pack) carries the name; the laurel ends
// stay fixed while the travertine centre stretches (9-slice border-image).
export default function OrnateHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="ornate-header">
      <div className="oh-banner"><h1>{title}</h1></div>
      {subtitle && <p className="muted oh-sub">{subtitle}</p>}
    </div>
  );
}
