"use client";

import { useState } from "react";

/**
 * The two dashboard charts, hand-built in SVG/HTML (no chart library).
 * Specs follow the dataviz guidance: thin marks with rounded data ends, a
 * recessive grid, selective direct labels, a hover/focus readout on every
 * mark, and a table view so nothing depends on hovering or on color alone.
 */

function weekLabel(week: string) {
  const [y, m, d] = week.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function QuotaChart({ history, quota }: { history: { week: string; xp: number; attainment: number }[]; quota: number }) {
  const [active, setActive] = useState(history.length - 1);
  const W = 320;
  const H = 150;
  const top = 18;
  const bottom = 22;
  const plotH = H - top - bottom;
  const max = Math.max(quota * 1.15, ...history.map((h) => h.xp), 1);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const band = W / history.length;
  const barW = Math.min(24, band * 0.55);
  const shown = history[active];

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Weekly XP vs quota</span>
        <span className="text-sm text-muted" aria-live="polite">
          Week of {weekLabel(shown.week)}: <strong className="text-foreground">{shown.xp} XP</strong> ({shown.attainment}%)
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Weekly XP for the last ${history.length} weeks against a quota of ${quota}`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--grid)" strokeWidth={1} />
        {/* Quota reference line, labeled directly rather than with a legend. */}
        <line x1={0} x2={W} y1={y(quota)} y2={y(quota)} stroke="var(--muted)" strokeWidth={1} />
        <text x={W} y={y(quota) - 4} textAnchor="end" fontSize={10} fill="var(--muted)">
          Quota {quota}
        </text>
        {history.map((h, i) => {
          const x = band * i + (band - barW) / 2;
          const barTop = y(h.xp);
          const height = y(0) - barTop;
          const r = Math.min(4, height / 2, barW / 2);
          // Rounded at the data end, square at the baseline.
          const path =
            height <= 0
              ? ""
              : `M${x},${y(0)} V${barTop + r} Q${x},${barTop} ${x + r},${barTop} H${x + barW - r} Q${x + barW},${barTop} ${x + barW},${barTop + r} V${y(0)} Z`;
          const isActive = i === active;
          return (
            <g key={h.week}>
              {path && <path d={path} fill="var(--viz-1)" opacity={isActive ? 1 : 0.75} />}
              {i === history.length - 1 && h.xp > 0 && (
                <text x={x + barW / 2} y={barTop - 4} textAnchor="middle" fontSize={10} fill="var(--foreground)">
                  {h.xp}
                </text>
              )}
              <text x={band * i + band / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--muted)">
                {weekLabel(h.week)}
              </text>
              {/* Hit target: the whole column band, bigger than the bar. */}
              <rect
                x={band * i}
                y={0}
                width={band}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`Week of ${weekLabel(h.week)}: ${h.xp} XP, ${h.attainment}% of quota`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="font-normal">Week of</th>
              <th className="font-normal">XP</th>
              <th className="font-normal">Quota</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.week}>
                <td>{weekLabel(h.week)}</td>
                <td>{h.xp}</td>
                <td>{h.attainment}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

type TopicRow = { topic: string; total: number; mastered: number; learning: number; new: number };

export function TopicMastery({ topics }: { topics: TopicRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = topics.find((t) => t.topic === active);

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">Mastery by topic</span>
        <span className="flex gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-viz-1" aria-hidden /> Mastered
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-viz-2" aria-hidden /> Learning
          </span>
        </span>
      </figcaption>
      <p className="mt-1 h-5 text-sm text-muted" aria-live="polite">
        {shown
          ? `${shown.topic}: ${shown.mastered} mastered, ${shown.learning} learning, ${shown.new} not started`
          : "Tap a topic for its numbers."}
      </p>
      <ul className="mt-2 space-y-2.5">
        {topics.map((t) => {
          const pct = (n: number) => `${(n / t.total) * 100}%`;
          return (
            <li key={t.topic}>
              <button
                type="button"
                className="block w-full text-left"
                onPointerEnter={() => setActive(t.topic)}
                onFocus={() => setActive(t.topic)}
                onClick={() => setActive(t.topic)}
                aria-label={`${t.topic}: ${t.mastered} of ${t.total} mastered, ${t.learning} learning`}
              >
                <span className="flex justify-between text-sm">
                  <span>{t.topic}</span>
                  <span className="text-muted">
                    {t.mastered}/{t.total}
                  </span>
                </span>
                {/* Segments separated by a 2px surface gap, never a border. */}
                <span className="mt-1 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-grid">
                  {t.mastered > 0 && <span className="rounded-full bg-viz-1" style={{ width: pct(t.mastered) }} />}
                  {t.learning > 0 && <span className="rounded-full bg-viz-2" style={{ width: pct(t.learning) }} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-muted">
              <th className="font-normal">Topic</th>
              <th className="font-normal">Mastered</th>
              <th className="font-normal">Learning</th>
              <th className="font-normal">New</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.topic}>
                <td>{t.topic}</td>
                <td>{t.mastered}</td>
                <td>{t.learning}</td>
                <td>{t.new}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
