"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CallRoom } from "@/components/CallRoom";
import type { BossUnit } from "@/lib/boss";

type BossCard = { name: string; role: string; blurb: string };

export function BossBattles({ units, bosses, winScore }: { units: BossUnit[]; bosses: Record<string, BossCard>; winScore: number }) {
  const [fighting, setFighting] = useState<BossUnit | null>(null);
  const router = useRouter();

  if (fighting) {
    return (
      <CallRoom
        setup={{ mode: "boss", topic: fighting.topic }}
        buyer={bosses[fighting.track]}
        onExit={() => {
          setFighting(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Boss battles</h1>
      <p className="mt-1 text-sm text-muted">
        Each topic has a boss: a tough executive who grills you on that topic only. Master half a topic&apos;s cards to
        unlock it. Score {winScore}+ to win.
      </p>
      <ul className="mt-4 space-y-2">
        {units.map((u) => {
          const boss = bosses[u.track];
          return (
            <li key={u.topic} className="rounded-2xl border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{u.topic}</p>
                  <p className="text-sm text-muted">
                    {boss.name}, {boss.role}
                  </p>
                </div>
                {u.defeated ? (
                  <span className="shrink-0 rounded-full bg-good/15 px-2 py-0.5 text-xs font-medium text-good">Defeated</span>
                ) : u.unlocked ? (
                  <button onClick={() => setFighting(u)} className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
                    Fight
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-muted">Locked</span>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-grid" aria-hidden>
                <div className="h-full rounded-full bg-viz-1" style={{ width: `${Math.min(100, (u.mastered / u.needed) * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">
                {u.unlocked
                  ? `${u.mastered}/${u.total} mastered${u.bestScore !== null ? ` · best ${u.bestScore}` : ""}`
                  : `${u.mastered}/${u.needed} mastered to unlock`}
              </p>
              {u.defeated && (
                <button onClick={() => setFighting(u)} className="mt-2 text-sm text-accent underline-offset-4 hover:underline">
                  Rematch
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
