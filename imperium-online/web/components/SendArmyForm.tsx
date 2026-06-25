"use client";

// Appears when you click an enemy colonia on the world map. Lets you pick how
// many of each standing unit to march on it, validates against what's at home,
// and dispatches the attack. The server re-validates and computes travel time.

import { useState } from "react";
import type { City, UnitStack } from "@/lib/api";
import { sendArmy } from "@/lib/api";
import { UNIT_ICONS } from "@/components/UnitIcons";

export default function SendArmyForm({
  token,
  city,
  target,
  onSent,
  onCancel,
}: {
  token: string;
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

  function setCount(unitType: string, value: number, max: number) {
    setCounts((c) => ({ ...c, [unitType]: Math.max(0, Math.min(max, value || 0)) }));
  }

  async function submit() {
    const units = Object.fromEntries(Object.entries(counts).filter(([, c]) => c > 0));
    if (Object.keys(units).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await sendArmy(token, target.x, target.y, units);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send army");
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>
        March on {target.name} <span className="muted" style={{ fontSize: "0.8rem" }}>· {target.owner} · ({target.x}, {target.y})</span>
      </h3>

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

          {error && <div className="error">{error}</div>}

          <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" disabled={busy || total === 0} onClick={submit}>
              {busy ? "Marching…" : `Send ${total || ""} ${total === 1 ? "soldier" : "soldiers"}`}
            </button>
            <button className="btn btn-ghost" onClick={onCancel} type="button">Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
