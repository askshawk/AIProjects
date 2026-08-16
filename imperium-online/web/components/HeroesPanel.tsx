"use client";

// Heroes & Officers panel (C3).
//
// Four posts, one per archetype. A filled post shows its officer's level, the
// standing bonus they lend the city, and progress toward the next level; an
// empty one shows what it would take to fill it. Heroes don't march, so this
// panel is a roster of appointments rather than an army list.

import type { City, HeroPost } from "@/lib/api";

const GLYPH: Record<string, string> = {
  legatus: "🦅",
  praefectus: "🛡️",
  navarch: "⚓",
  quaestor: "⚖️",
};

export default function HeroesPanel({
  city,
  onAppoint,
}: {
  city: City;
  onAppoint: (archetype: string) => Promise<void>;
}) {
  const filled = city.heroes.filter((h) => h.recruited).length;

  return (
    <div className="card">
      <h3>
        Heroes &amp; Officers{" "}
        <span className="muted" style={{ fontSize: "0.8rem" }}>· {filled} appointed</span>
      </h3>
      <p className="muted" style={{ marginTop: -6, fontSize: "0.82rem" }}>
        Officers hold a post rather than march. They gain experience from every
        battle their city fights — won or lost.
      </p>

      <ul className="hero-list">
        {city.heroes.map((h) => (
          <HeroRow key={h.archetype} hero={h} onAppoint={onAppoint} />
        ))}
      </ul>
    </div>
  );
}

function HeroRow({
  hero,
  onAppoint,
}: {
  hero: HeroPost;
  onAppoint: (archetype: string) => Promise<void>;
}) {
  const cost = [
    hero.cost.wood > 0 ? `${Math.round(hero.cost.wood)} wood` : null,
    hero.cost.stone > 0 ? `${Math.round(hero.cost.stone)} stone` : null,
    hero.cost.silver > 0 ? `${Math.round(hero.cost.silver)} silver` : null,
  ].filter(Boolean).join(" · ");

  // Progress toward the next level, as a fraction of the current band.
  const bandStart = Math.max(0, (hero.level - 1) * 100);
  const pct = hero.next_level_xp > 0
    ? Math.min(100, ((hero.xp - bandStart) / (hero.next_level_xp - bandStart)) * 100)
    : 100;

  return (
    <li className={`hero-row${hero.recruited ? " posted" : ""}`}>
      <span className="hero-seal" aria-hidden>{GLYPH[hero.archetype] ?? "⚔"}</span>
      <span className="hero-text">
        <span className="hero-name">
          {hero.recruited ? hero.name : hero.label}
          {hero.recruited && (
            <span className="hero-rank"> · {hero.label} · level {hero.level}</span>
          )}
        </span>
        <span className="muted hero-blurb">{hero.blurb}</span>
        {hero.recruited ? (
          <>
            <span className="hero-bonus">+{hero.bonus_pct}% while posted here</span>
            <span className="hero-xp-track" title={`${hero.xp} experience`}>
              <span style={{ width: `${pct}%` }} />
            </span>
          </>
        ) : (
          <span className="muted hero-cost">{cost} · Forum {hero.forum_level}</span>
        )}
      </span>
      {!hero.recruited && (
        <button
          className="btn"
          type="button"
          disabled={!hero.can_recruit}
          title={hero.blocked_reason ?? undefined}
          onClick={() => onAppoint(hero.archetype)}
        >
          Appoint
        </button>
      )}
    </li>
  );
}
