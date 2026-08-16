"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getReports, type BattleReport } from "@/lib/api";
import TopBar from "@/components/TopBar";
import OrnateHeader from "@/components/OrnateHeader";
import BattleReplay from "@/components/BattleReplay";
import EmptyState from "@/components/EmptyState";

export default function ReportsPage() {
  const { authed, ready } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<BattleReport[] | null>(null);

  useEffect(() => {
    if (ready && !authed) router.replace("/login");
  }, [ready, authed, router]);

  useEffect(() => {
    if (!authed) return;
    getReports().then(setReports).catch(() => setReports([]));
  }, [authed]);

  if (!ready || !authed) return null;

  return (
    <>
      <TopBar />
      <div className="container">
        <OrnateHeader title="Battle Reports" subtitle="Dispatches from the field — replay any engagement." />
        {!reports ? (
          <p className="muted">Consulting the dispatches…</p>
        ) : reports.length === 0 ? (
          <EmptyState glyph="📜" action={{ href: "/map", label: "Find a rival" }}>
            The archive is empty. Win or lose, every engagement is recorded here —
            and you can replay it.
          </EmptyState>
        ) : (
          reports.map((r) => {
            const iWon = (r.i_attacked && r.outcome === "attacker_won") || (!r.i_attacked && r.outcome === "defender_won");
            return (
              <div className={`card report${iWon ? " win" : " loss"}`} key={r.id} style={{ marginBottom: 14 }}>
                {/* The verdict itself is the stamp at the foot of the replay. */}
                <div className="report-head">
                  <span className="muted">
                    {r.attacker_city_name} attacked {r.defender_city_name}
                    {r.i_attacked ? " · you attacked" : " · you defended"}
                  </span>
                  {r.captured && <span className="captured-badge">{r.i_attacked ? "City captured!" : "City lost!"}</span>}
                </div>
                {r.captured && (
                  <div className="loyalty-line">
                    Loyalty broke — the city changes hands.
                  </div>
                )}
                <BattleReplay report={r} iWon={iWon} />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
