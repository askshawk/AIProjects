// A gilded, meander-underlined page header — the classical "plaque" that names
// the current city/view (echoes Grepolis's ornamental city banner).

export default function OrnateHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="ornate-header">
      <div className="oh-plaque">
        <span className="oh-laurel" aria-hidden>❦</span>
        <h1>{title}</h1>
        <span className="oh-laurel" aria-hidden>❦</span>
      </div>
      <div className="meander-rule" aria-hidden />
      {subtitle && <p className="muted oh-sub">{subtitle}</p>}
    </div>
  );
}
