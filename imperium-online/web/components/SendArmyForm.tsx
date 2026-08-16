"use client";

// Appears when you click an enemy colonia on the world map. Lets you pick how
// many of each standing unit to march on it, validates against what's at home,
// and dispatches the attack. The server re-validates and computes travel time.

import { useMemo, useState } from "react";
import type { City, UnitStack } from "@/lib/api";
import { sendArmy } from "@/lib/api";
import { sameIsland } from "@/lib/islands";
import { UNIT_ICONS } from "@/components/UnitIcons";

export default function SendArmyForm({
  city,
  target,
  onSent,
  onCancel,
}: {
  city: City;
  target: { x: number; y: number; name: string; owner: string };
  onSent: () => void;
  onCancel: () => void;
}) {
  const available = city.units.filter((u) => u.have > 0);
  const [counts, setCounts] = useState<UnitStack>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Crossing to another island is a sea voyage: every land unit needs a berth
  // aboard a transport. Mirrors the server rule so the player sees the problem
  // before hitting send rather than as a 400.
  const crossing = !sameIsland(city.x, city.y, target.x, target.y);
  const { cargo, berths } = useMemo(() => {
    let cargo = 0, berths = 0;
    for (const u of city.units) {
      const n = counts[u.unit_type] ?? 0;
      if (n <= 0) continue;
      if (u.domain === "sea") berths += u.capacity * n;
      else cargo += u.population * n;
    }
    return { cargo, berths };
  }, [counts, city.units]);
  const overloaded = crossing && cargo > berths;

  function setCount(unitType: string, value: number, max: number) {
    setCounts((c) => ({ ...c, [unitType]: Math.max(0, Math.min(max, value || 0)) }));
  }

  async function submit() {
    const units = Object.fromEntries(Object.entries(counts).filter(([, c]) => c > 0));
    if (Object.keys(units).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await sendArmy(city.id, target.x, target.y, units);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send army");
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>
        Send army → {target.name} <span className="muted" style={{ fontSize: "0.8rem" }}>· {target.owner} · ({target.x}, {target.y}) · from {city.name}</span>
      </h3>
      <p className="muted" style={{ marginTop: -4, fontSize: "0.82rem" }}>
        Attack an enemy, reinforce your own/allied city, or include a <strong>Settler</strong> to found a colony on an empty cell.
      </p>

      {available.length === 0 ? (
        <p className="muted">You have no troops at home to send. Recruit some first.</p>
      ) : (
        <>
          <div className="send-grid">
            {available.map((u) => {
              const Icon = UNIT_ICONS[u.unit_type];
              return (
                <div className="send-unit" key={u.unit_type}>
                  <span className="su-icon">{Icon && <Icon />}</span>
                  <span className="su-label">{u.label}</span>
                  <span className="su-have muted">{u.have} home</span>
                  <input
                    type="number"
                    min={0}
                    max={u.have}
                    value={counts[u.unit_type] ?? 0}
                    onChange={(e) => setCount(u.unit_type, Number(e.target.value), u.have)}
                  />
                </div>
              );
            })}
          </div>

          {crossing && (
            <div className={`crossing-meter${overloaded ? " over" : ""}`}>
              <span className="cm-label">
                ⚓ Crossing open sea — troops need transport berths
              </span>
              <div className="cm-track">
                <span style={{ width: `${berths > 0 ? Math.min(100, (cargo / berths) * 100) : (cargo > 0 ? 100 : 0)}%` }} />
              </div>
              <span className="cm-count">{cargo} / {berths}</span>
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" disabled={busy || total === 0 || overloaded} onClick={submit}>
              {busy ? "Marching…" : overloaded ? "Not enough berths" : `Send ${total || ""} ${total === 1 ? "soldier" : "soldiers"}`}
            </button>
            <button className="btn btn-ghost" onClick={onCancel} type="button">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
