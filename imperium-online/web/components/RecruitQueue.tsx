"use client";

// Live countdowns for units in training — the recruitment twin of BuildQueue.
// Same approach: the deadline is the server's completes_at, the countdown ticks
// client-side, and we call onComplete the moment a batch finishes so the parent
// refetches the authoritative state (which moves the units into the army).

import { useEffect, useState } from "react";
import type { RecruitJob } from "@/lib/api";
import { UNIT_ICONS } from "@/components/UnitIcons";
import EmptyState from "@/components/EmptyState";

const LABELS: Record<string, string> = {
  legionary: "Legionaries",
  archer: "Archers",
  scout: "Scouts",
};

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function RecruitQueue({
  jobs,
  onComplete,
}: {
  jobs: RecruitJob[];
  onComplete: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (jobs.length === 0) return;
    const soonest = Math.min(...jobs.map((j) => new Date(j.completes_at).getTime()));
    if (now >= soonest) onComplete();
  }, [now, jobs, onComplete]);

  if (jobs.length === 0) {
    return (
      <EmptyState glyph="🛡️" compact>
        The drill yard is quiet. Recruit above and they'll muster on a timer.
      </EmptyState>
    );
  }

  return (
    <div>
      {jobs.map((job) => {
        const Icon = UNIT_ICONS[job.unit_type];
        const remaining = new Date(job.completes_at).getTime() - now;
        return (
          <div className="queue-item" key={job.id}>
            <span className="thumb">{Icon && <Icon />}</span>
            <span className="label">
              {job.count}× {LABELS[job.unit_type] ?? job.unit_type}
            </span>
            <span className="countdown">{formatRemaining(remaining)}</span>
          </div>
        );
      })}
    </div>
  );
}
