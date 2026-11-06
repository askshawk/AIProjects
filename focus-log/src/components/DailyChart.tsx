"use client";

import { useState } from "react";
import { CATEGORIES, CATEGORY_INFO, formatMinutes } from "@/lib/categories";
import type { Totals } from "@/lib/stats";

/**
 * Minutes per day, stacked by category, hand-built in SVG (no chart library),
 * following the dataviz rules: fixed category colours, a 2px gap between
 * stacked segments, rounded top only, recessive grid, a legend, a readout on
 * hover or tap, and a table view so nothing depends on colour alone.
 */

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
};

export function DailyChart({ days }: { days: { key: string; totals: Totals }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 336;
  const H = 180;
  const top = 16;
  const bottom = 22;
  const plotH = H - top - bottom;
  const totalOf = (t: Totals) => CATEGORIES.reduce((n, c) => n + t[c], 0);
  const maxMinutes = Math.max(60, ...days.map((d) => totalOf(d.totals)));
  // Gridlines every 1, 2 or 4 hours depending on the tallest day.
  const stepH = maxMinutes > 8 * 60 ? 4 : maxMinutes > 4 * 60 ? 2 : 1;
  const maxH = Math.ceil(maxMinutes / 60 / stepH) * stepH;
  const y = (min: number) => top + plotH - (min / (maxH * 60)) * plotH;
  const band = W / days.length;
  const barW = Math.min(28, band * 0.6);
  const shown = active === null ? null : days[active];

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">Time per day</span>
        <span className="flex flex-wrap gap-3 text-xs text-muted">
          {CATEGORIES.map((c) => (
            <span key={c} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_INFO[c].color }} aria-hidden />
              {CATEGORY_INFO[c].label}
            </span>
          ))}
        </span>
      </figcaption>
      <p className="mt-1 min-h-5 text-sm text-muted" aria-live="polite">
        {shown
          ? `${dayLabel(shown.key, { weekday: "long" })}: ${CATEGORIES.filter((c) => shown.totals[c] >= 1)
              .map((c) => `${CATEGORY_INFO[c].label} ${formatMinutes(shown.totals[c])}`)
              .join(", ") || "nothing logged"}`
          : "Tap a day for its breakdown."}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Minutes per day this week, stacked by category">
        {Array.from({ length: maxH / stepH + 1 }, (_, i) => i * stepH).map((h) => (
          <g key={h}>
            <line x1={0} x2={W} y1={y(h * 60)} y2={y(h * 60)} stroke="var(--grid)" strokeWidth={1} />
            {h > 0 && (
              <text x={0} y={y(h * 60) - 3} fontSize={9} fill="var(--muted)">
                {h}h
              </text>
            )}
          </g>
        ))}
        {days.map((d, i) => {
          const x = band * i + (band - barW) / 2;
          let base = 0;
          const segments = CATEGORIES.filter((c) => d.totals[c] >= 1).map((c) => {
            const seg = { c, from: base, to: base + d.totals[c] };
            base = seg.to;
            return seg;
          });
          return (
            <g key={d.key} opacity={active === null || active === i ? 1 : 0.55}>
              {segments.map((s, j) => {
                const isTop = j === segments.length - 1;
                // 2px surface gap between stacked segments.
                const y0 = y(s.from) - (j > 0 ? 1 : 0);
                const y1 = y(s.to) + (isTop ? 0 : 1);
                const h = y0 - y1;
                if (h <= 0) return null;
                const r = isTop ? Math.min(4, h, barW / 2) : 0;
                const path = `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y0} Z`;
                return <path key={s.c} d={path} fill={CATEGORY_INFO[s.c].color} />;
              })}
              <text x={band * i + band / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {dayLabel(d.key, { weekday: "short" })}
              </text>
              <rect
                x={band * i}
                y={0}
                width={band}
                height={H}
                fill="transparent"
                tabIndex={0}
                aria-label={`${dayLabel(d.key, { weekday: "long" })}: ${formatMinutes(totalOf(d.totals))} total`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
              />
            </g>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left tabular-nums">
            <thead>
              <tr className="text-muted">
                <th className="font-normal">Day</th>
                {CATEGORIES.map((c) => (
                  <th key={c} className="font-normal">
                    {CATEGORY_INFO[c].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.key}>
                  <td>{dayLabel(d.key, { weekday: "short" })}</td>
                  {CATEGORIES.map((c) => (
                    <td key={c}>{formatMinutes(d.totals[c])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
