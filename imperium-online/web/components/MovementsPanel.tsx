"use client";

// Armies on the road, to and from your city. Incoming enemy attacks get a loud
// red warning; your own marches (outgoing attacks, returning survivors) show a
// calm countdown. Self-contained: polls /movements/me and refetches the instant
// any countdown hits zero (that's when the server resolves it).

import { useCallback, useEffect, useState } from "react";
import { getMovements, type Movement } from "@/lib/api";

const UNIT_LABEL: Record<string, string> = { legionary: "Leg.", archer: "Arc.", scout: "Sct." };

function stackText(payload: Record<string, number>): string {
  return Object.entries(payload)
    .map(([t, c]) => `${c} ${UNIT_LABEL[t] ?? t}`)
    .join(", ");
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function MovementsPanel({ token }: { token: string }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setMovements(await getMovements(token));
    } catch {
      /* transient — keep last known */
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 8000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  // When the soonest arrival passes, refetch: the server has now resolved it.
  useEffect(() => {
    if (movements.length === 0) return;
    const soonest = Math.min(...movements.map((m) => new Date(m.arrives_at).getTime()));
    if (now >= soonest) refresh();
  }, [now, movements, refresh]);

  if (movements.length === 0) {
    return (
      <div className="card">
        <h3>Movements</h3>
        <p className="muted" style={{ margin: 0 }}>No armies on the road.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Movements</h3>
      {movements.map((m) => {
        const remaining = new Date(m.arrives_at).getTime() - now;
        const kindLabel =
          m.incoming_attack ? "⚔ Incoming attack" :
          m.kind === "return" ? "↩ Returning home" :
          "→ Attack";
        return (
          <div className={`movement-row${m.incoming_attack ? " threat" : ""}`} key={m.id}>
            <span className="mv-kind">{kindLabel}</span>
            <span className="mv-detail">
              {stackText(m.payload)} · {m.from_name} → {m.to_name}
            </span>
            <span className="countdown">{formatRemaining(remaining)}</span>
          </div>
        );
      })}
    </div>
  );
}
