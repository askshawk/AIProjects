"use client";

// Harbour & Fleet panel (C1b).
//
// Ships are recruited exactly like soldiers — same queue, same economics — but
// they're gated on the Harbour rather than the Barracks, and they're the only
// way an army crosses between islands. Kept as its own panel so the fleet reads
// as a separate arm rather than a few odd rows under "Barracks & Army".

import { useMemo, useState } from "react";
import type { City, UnitType } from "@/lib/api";
import { UNIT_ICONS } from "@/components/UnitIcons";
import { AttackIcon, DefenseIcon } from "@/components/ResourceIcons";
import EmptyState from "@/components/EmptyState";

export default function HarbourPanel({
  city,
  onRecruit,
}: {
  city: City;
  onRecruit: (unitType: string, count: number) => Promise<void>;
}) {
  const ships = useMemo(() => city.units.filter((u) => u.domain === "sea"), [city.units]);
  const built = city.harbour_level >= 1;
  const [selected, setSelected] = useState<string>(ships[0]?.unit_type ?? "trireme");
  const [count, setCount] = useState<number>(2);

  const unit: UnitType | undefined = useMemo(
    () => ships.find((u) => u.unit_type === selected) ?? ships[0],
    [ships, selected],
  );

  // Live cost + population check for the chosen quantity (display/enable only).
  const check = useMemo(() => {
    if (!unit || count < 1) return { afford: false, popOk: false, cost: { wood: 0, stone: 0, silver: 0 } };
    const cost = {
      wood: unit.cost.wood * count,
      stone: unit.cost.stone * count,
      silver: unit.cost.silver * count,
    };
    const afford = city.wood >= cost.wood && city.stone >= cost.stone && city.silver >= cost.silver;
    const popOk = city.population_used + unit.population * count <= city.population_cap;
    return { afford, popOk, cost };
  }, [unit, count, city]);

  if (!built) {
    return (
      <div className="card">
        <h3>Harbour &amp; Fleet</h3>
        <EmptyState glyph="⚓" action={{ href: "#buildings", label: "Build a Harbour" }}>
          No slipways yet. Every city sits on an island — without ships your
          legions can never leave it.
        </EmptyState>
      </div>
    );
  }

  // Total berths currently in port, so the player can size an invasion.
  const berths = ships.reduce((sum, s) => sum + s.capacity * s.have, 0);
  const canSubmit = unit?.can_recruit && check.afford && check.popOk && count >= 1;

  return (
    <div className="card">
      <h3>
        Harbour &amp; Fleet{" "}
        <span className="muted" style={{ fontSize: "0.8rem" }}>· level {city.harbour_level}</span>
      </h3>
      <p className="muted" style={{ marginTop: -6, fontSize: "0.82rem" }}>
        {berths > 0
          ? `${berths} berths in port — enough to carry ${berths} population of troops overseas.`
          : "No transports in port. Warships alone cannot carry an army."}
      </p>

      <div className="roster">
        {ships.map((u) => {
          const Icon = UNIT_ICONS[u.unit_type];
          return (
            <button
              key={u.unit_type}
              className={`unit-card${selected === u.unit_type ? " selected" : ""}`}
              onClick={() => setSelected(u.unit_type)}
              type="button"
            >
              <span className="unit-icon">{Icon && <Icon />}</span>
              <span className="unit-name">{u.label}</span>
              <span className="unit-have">{u.have}</span>
              <span className="unit-stats">
                {u.capacity > 0 ? (
                  <>⚓ {u.capacity} berths</>
                ) : (
                  <>
                    <AttackIcon className="stat-ico" /> {u.attack} ·{" "}
                    <DefenseIcon className="stat-ico" /> {u.defense}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {unit && (
        <div className="recruit-form">
          <div className="recruit-controls">
            <label htmlFor="ship-count" style={{ margin: 0 }}>Lay down {unit.label}</label>
            <input
              id="ship-count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
              style={{ width: 90 }}
            />
            <button className="btn" type="button" disabled={!canSubmit} onClick={() => onRecruit(unit.unit_type, count)}>
              Build
            </button>
          </div>
          <div className="cost-line" style={{ marginTop: 8 }}>
            <span className={`ci${city.wood < check.cost.wood ? " short" : ""}`}>{Math.round(check.cost.wood)} wood</span>
            <span className={`ci${city.stone < check.cost.stone ? " short" : ""}`}>{Math.round(check.cost.stone)} stone</span>
            <span className={`ci${city.silver < check.cost.silver ? " short" : ""}`}>{Math.round(check.cost.silver)} silver</span>
            <span className="meta">· {unit.population * count} pop · {unit.seconds * count}s</span>
            {!check.popOk && <span className="blocked">· not enough population</span>}
          </div>
        </div>
      )}
    </div>
  );
}
