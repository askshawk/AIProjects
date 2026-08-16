"use client";

// Academy & Research panel (C2).
//
// The Academy turns building levels into research points; points plus resources
// buy permanent technologies. Research is instant — points are the scarce
// thing, not time — so this is a straightforward catalog with one button per
// technology and an honest reason whenever one is out of reach.

import type { City, ResearchOption } from "@/lib/api";
import EmptyState from "@/components/EmptyState";

export default function AcademyPanel({
  city,
  onResearch,
}: {
  city: City;
  onResearch: (tech: string) => Promise<void>;
}) {
  if (city.academy_level < 1) {
    return (
      <div className="card">
        <h3>Academy &amp; Research</h3>
        <EmptyState glyph="📜" action={{ href: "#buildings", label: "Build an Academy" }}>
          No scholars yet. An Academy turns its levels into research points —
          the only way to unlock lasting improvements.
        </EmptyState>
      </div>
    );
  }

  const done = city.research.filter((r) => r.researched).length;

  return (
    <div className="card">
      <h3>
        Academy &amp; Research{" "}
        <span className="muted" style={{ fontSize: "0.8rem" }}>· level {city.academy_level}</span>
      </h3>
      <p className="muted" style={{ marginTop: -6, fontSize: "0.82rem" }}>
        <strong className="rp-count">{city.research_points}</strong> research points unspent ·{" "}
        {done}/{city.research.length} technologies known
      </p>

      <ul className="tech-list">
        {city.research.map((t) => (
          <TechRow key={t.tech} tech={t} onResearch={onResearch} />
        ))}
      </ul>
    </div>
  );
}

function TechRow({
  tech,
  onResearch,
}: {
  tech: ResearchOption;
  onResearch: (tech: string) => Promise<void>;
}) {
  const cost = [
    tech.cost.wood > 0 ? `${Math.round(tech.cost.wood)} wood` : null,
    tech.cost.stone > 0 ? `${Math.round(tech.cost.stone)} stone` : null,
    tech.cost.silver > 0 ? `${Math.round(tech.cost.silver)} silver` : null,
  ].filter(Boolean).join(" · ");

  return (
    <li className={`tech-row${tech.researched ? " known" : ""}`}>
      <span className="tech-seal" aria-hidden>{tech.researched ? "✓" : tech.points}</span>
      <span className="tech-text">
        <span className="tech-name">{tech.label}</span>
        <span className="muted tech-blurb">{tech.blurb}</span>
        <span className="muted tech-cost">
          {tech.researched
            ? "Known"
            : <>{tech.points} pts · {cost} · Academy {tech.academy_level}</>}
        </span>
      </span>
      {!tech.researched && (
        <button
          className="btn"
          type="button"
          disabled={!tech.can_research}
          title={tech.blocked_reason ?? undefined}
          onClick={() => onResearch(tech.tech)}
        >
          Research
        </button>
      )}
    </li>
  );
}
