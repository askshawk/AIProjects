"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getReports, type BattleReport } from "@/lib/api";
import TopBar from "@/components/TopBar";

const UNIT_LABEL: Record<string, string> = { legionary: "Legionaries", archer: "Archers", scout: "Scouts" };

function stack(s: Record<string, number>): string {
  const parts = Object.entries(s).filter(([, c]) => c > 0).map(([t, c]) => `${c} ${UNIT_LABEL[t] ?? t}`);
  return parts.length ? parts.join(", ") : "—";
}

function losses(before: Record<string, number>, after: Record<string, number>): string {
  const out: string[] = [];
  for (const [t, c] of Object.entries(before)) {
    const lost = c - (after[t] ?? 0);
    if (lost > 0) out.push(`${lost} ${UNIT_LABEL[t] ?? t}`);
  }
  return out.length ? out.join(", ") : "none";
}

export default function ReportsPage() {
  const { token, ready } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<BattleReport[] | null>(null);

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  useEffect(() => {
    if (!token) return;
    getReports(token).then(setReports).catch(() => setReports([]));
  }, [token]);

  if (!ready || !token) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <h1>Battle reports</h1>
        {!reports ? (
          <p className="muted">Consulting the dispatches…</p>
        ) : reports.length === 0 ? (
          <p className="muted">No battles yet. March on a rival from the world map.</p>
        ) : (
          reports.map((r) => {
            const iWon = (r.i_attacked && r.outcome === "attacker_won") || (!r.i_attacked && r.outcome === "defender_won");
            return (
              <div className={`card report${iWon ? " win" : " loss"}`} key={r.id} style={{ marginBottom: 14 }}>
                <div className="report-head">
                  <span className="report-result">{iWon ? "Victory" : "Defeat"}</span>
                  <span className="muted">
                    {r.attacker_city_name} attacked {r.defender_city_name}
                    {r.i_attacked ? " · you attacked" : " · you defended"}
                  </span>
                </div>
                <div className="report-grid">
                  <div>
                    <h4>Attacker — {r.attacker_city_name}</h4>
                    <div>Sent: {stack(r.attacker_sent)}</div>
                    <div>Survived: {stack(r.attacker_survivors)}</div>
                    <div className="muted">Lost: {losses(r.attacker_sent, r.attacker_survivors)}</div>
                  </div>
                  <div>
                    <h4>Defender — {r.defender_city_name}</h4>
                    <div>Garrison: {stack(r.defender_before)}</div>
                    <div>Survived: {stack(r.defender_survivors)}</div>
                    <div className="muted">Lost: {losses(r.defender_before, r.defender_survivors)}</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
