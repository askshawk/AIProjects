"use client";

// Animated battle replay (Phase 8B — B2).
//
// A report is the most dramatic data the game produces, but it reads like a
// spreadsheet. This stages it: the two forces march in, clash, the casualty
// counts tick down from what was committed to what walked away, the defender's
// loyalty drains, and a verdict stamp lands.
//
// At rest the panel already shows the *final* numbers, so a report is fully
// readable without pressing anything — replaying re-runs the sequence from the
// opening strength. Under prefers-reduced-motion the button is hidden and the
// final state is all there is.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleReport, UnitStack } from "@/lib/api";
import { UNIT_ICONS } from "@/components/UnitIcons";
import StatNumber from "@/components/StatNumber";

const UNIT_LABEL: Record<string, string> = {
  legionary: "Legionaries",
  archer: "Archers",
  scout: "Scouts",
  settler: "Settlers",
};

type Phase = "rest" | "march" | "clash" | "toll" | "verdict";

// Every unit type that appears on either side of one force, in a stable order.
function unitRows(before: UnitStack, after: UnitStack): { type: string; before: number; after: number }[] {
  const types = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...types]
    .map((t) => ({ type: t, before: before[t] ?? 0, after: after[t] ?? 0 }))
    .filter((r) => r.before > 0 || r.after > 0)
    .sort((a, b) => b.before - a.before);
}

function total(s: UnitStack): number {
  return Object.values(s).reduce((a, b) => a + b, 0);
}

function Force({
  title,
  subtitle,
  rows,
  showBefore,
  runId,
  side,
  phase,
}: {
  title: string;
  subtitle: string;
  rows: { type: string; before: number; after: number }[];
  showBefore: boolean;
  runId: number;
  side: "attacker" | "defender";
  phase: Phase;
}) {
  const marching = phase === "march" || phase === "clash";
  return (
    <div className={`br-force br-${side}${marching ? " marching" : ""}`}>
      <h4>{title}</h4>
      <p className="br-sub muted">{subtitle}</p>
      <ul className="br-rows">
        {rows.map((r) => {
          const Icon = UNIT_ICONS[r.type];
          const lost = r.before - r.after;
          return (
            <li key={r.type}>
              <span className="br-ico">{Icon && <Icon />}</span>
              <span className="br-name">{UNIT_LABEL[r.type] ?? r.type}</span>
              {/* Remounted per replay so the tween starts from full strength. */}
              <StatNumber
                key={`${runId}-${r.type}`}
                className="br-count"
                value={showBefore ? r.before : r.after}
              />
              {lost > 0 && phase !== "march" && phase !== "clash" && (
                <span className="br-lost">−{lost}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function BattleReplay({ report, iWon }: { report: BattleReport; iWon: boolean }) {
  const [phase, setPhase] = useState<Phase>("rest");
  const [runId, setRunId] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setReduceMotion(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  // Clear any pending steps if the component unmounts mid-replay.
  useEffect(() => {
    const pending = timers.current;
    return () => { for (const t of pending) clearTimeout(t); };
  }, []);

  const play = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setRunId((n) => n + 1);
    setPhase("march");
    const step = (ms: number, next: Phase) => {
      timers.current.push(setTimeout(() => setPhase(next), ms));
    };
    step(700, "clash");
    step(1150, "toll");
    step(2500, "verdict");
    // Settle back to rest so the battle can be replayed again; the resting
    // state shows the same final numbers and stamp, just without the animation.
    step(3300, "rest");
  }, []);

  const attackerRows = unitRows(report.attacker_sent, report.attacker_survivors);
  const defenderRows = unitRows(report.defender_before, report.defender_survivors);
  // Counts read full strength while the armies close and collide.
  const showBefore = phase === "march" || phase === "clash";
  const playing = phase !== "rest";

  const loyaltyShown = showBefore ? report.loyalty_before : report.loyalty_after;
  const loyaltyChanged = report.loyalty_before !== report.loyalty_after;

  return (
    <div className={`battle-replay phase-${phase}`}>
      <div className="br-stage">
        <Force
          title={`Attacker — ${report.attacker_city_name}`}
          subtitle={`${total(report.attacker_sent)} sent`}
          rows={attackerRows}
          showBefore={showBefore}
          runId={runId}
          side="attacker"
          phase={phase}
        />

        <div className="br-clash" aria-hidden>
          <span className="br-swords">⚔</span>
          {phase === "clash" && <span className="br-flash" />}
        </div>

        <Force
          title={`Defender — ${report.defender_city_name}`}
          subtitle={`${total(report.defender_before)} defending`}
          rows={defenderRows}
          showBefore={showBefore}
          runId={runId}
          side="defender"
          phase={phase}
        />
      </div>

      {loyaltyChanged && (
        <div className="br-loyalty">
          <span className="br-loyalty-label">
            Loyalty of {report.defender_city_name}
          </span>
          <div className="br-loyalty-track">
            <span style={{ width: `${Math.max(0, Math.min(100, loyaltyShown))}%` }} />
          </div>
          <span className="br-loyalty-num">
            <StatNumber key={`loy-${runId}`} value={loyaltyShown} /> / 100
          </span>
        </div>
      )}

      <div className="br-footer">
        {(!playing || phase === "verdict") && (
          <span className={`br-stamp${iWon ? " win" : " loss"}${phase === "verdict" ? " landing" : ""}`}>
            {iWon ? "Victory" : "Defeat"}
          </span>
        )}
        <span className="br-when muted">
          {new Date(report.created_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </span>
        {!reduceMotion && (
          <button type="button" className="btn btn-ghost br-play" onClick={play} disabled={playing}>
            {playing ? "Replaying…" : "▶ Replay the battle"}
          </button>
        )}
      </div>
    </div>
  );
}
