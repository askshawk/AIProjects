"use client";

// Renders the active build queue with live countdowns. The key idea from the
// plan: the countdown is computed CLIENT-SIDE from each job's server-issued
// completes_at timestamp — no polling just to tick the clock. We only call back
// to the server (onComplete) the moment a timer hits zero, to fetch the real,
// authoritative new state.

import { useEffect, useState } from "react";
import type { BuildJob } from "@/lib/api";

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const BUILDING_LABELS: Record<string, string> = {
  forum: "Forum",
  timber_camp: "Timber Camp",
  quarry: "Quarry",
  silver_mine: "Silver Mine",
};

export default function BuildQueue({
  jobs,
  onComplete,
}: {
  jobs: BuildJob[];
  onComplete: () => void;
}) {
  // A ticking "now" so the countdowns re-render once per second.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // When the earliest job's deadline passes, ask the parent to refetch the
  // authoritative state (which removes the finished job and bumps the level).
  useEffect(() => {
    if (jobs.length === 0) return;
    const soonest = Math.min(...jobs.map((j) => new Date(j.completes_at).getTime()));
    if (now >= soonest) onComplete();
  }, [now, jobs, onComplete]);

  if (jobs.length === 0) {
    return <p className="muted">Nothing under construction. Queue a building →</p>;
  }

  return (
    <div>
      {jobs.map((job) => {
        const remaining = new Date(job.completes_at).getTime() - now;
        return (
          <div className="queue-item" key={job.id}>
            <span className="thumb">
              <img src={`/assets/iso/${job.building}.png`} alt="" />
            </span>
            <span className="label">
              {BUILDING_LABELS[job.building] ?? job.building} → level {job.target_level}
            </span>
            <span className="countdown">{formatRemaining(remaining)}</span>
          </div>
        );
      })}
    </div>
  );
}
