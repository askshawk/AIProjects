"use client";

// Barracks & Army panel. Shows the standing roster (with attack/defense), a
// recruit form (unit type + quantity with a live cost + population check), and
// the in-training queue. All economics come from the server's unit catalog;
// affordability for the chosen quantity is the only thing computed client-side,
// purely to enable/disable the button — the server re-validates on submit.

import { useMemo, useState } from "react";
import type { City, UnitType } from "@/lib/api";
import { UNIT_ICONS } from "@/components/UnitIcons";
import { AttackIcon, DefenseIcon } from "@/components/ResourceIcons";
import RecruitQueue from "@/components/RecruitQueue";

export default function BarracksPanel({
  city,
  onRecruit,
  onQueueComplete,
}: {
  city: City;
  onRecruit: (unitType: string, count: number) => Promise<void>;
  onQueueComplete: () => void;
}) {
  const built = city.barracks_level >= 1;
  const [selected, setSelected] = useState<string>(city.units[0]?.unit_type ?? "legionary");
  const [count, setCount] = useState<number>(10);

  const unit: UnitType | undefined = useMemo(
    () => city.units.find((u) => u.unit_type === selected),
    [city.units, selected],
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
        <h3>Barracks &amp; Army</h3>
        <p className="muted" style={{ margin: 0 }}>
          You have no Barracks yet. Build one from the Buildings panel to begin training a legion.
        </p>
      </div>
    );
  }

  const canSubmit = unit?.can_recruit && check.afford && check.popOk && count >= 1;

  return (
    <div className="card">
      <h3>Barracks &amp; Army <span className="muted" style={{ fontSize: "0.8rem" }}>· level {city.barracks_level}</span></h3>

      <div className="roster">
        {city.units.map((u) => {
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
                <AttackIcon className="stat-ico" /> {u.attack} · <DefenseIcon className="stat-ico" /> {u.defense}
              </span>
            </button>
          );
        })}
      </div>

      {unit && (
        <div className="recruit-form">
          <div className="recruit-controls">
            <label htmlFor="count" style={{ margin: 0 }}>Recruit {unit.label}</label>
            <input
              id="count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(500, Number(e.target.value) || 0)))}
              style={{ width: 90 }}
            />
            <button className="btn" type="button" disabled={!canSubmit} onClick={() => onRecruit(selected, count)}>
              Recruit
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

      <h3 style={{ marginTop: 22 }}>Training</h3>
      <RecruitQueue jobs={city.recruit_jobs} onComplete={onQueueComplete} />
    </div>
  );
}
