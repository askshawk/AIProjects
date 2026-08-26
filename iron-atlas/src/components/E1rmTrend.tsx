/**
 * A sparkline for one exercise's estimated 1RM over time.
 *
 * Inline SVG rather than a charting library: this is a polyline over a handful
 * of points, and a dependency would cost more than it saves. Values are shown
 * as text too, so the trend is readable without interpreting the picture.
 */
export function E1rmTrend({
  name,
  points,
}: {
  name: string;
  points: number[];
}) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const width = 200;
  const height = 40;
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const path = points
    .map((v, i) => `${i * step},${height - ((v - min) / span) * height}`)
    .join(" ");

  const first = points[0];
  const latest = points[points.length - 1];
  const change = latest - first;
  const pct = first > 0 ? (change / first) * 100 : 0;

  return (
    <div className="rounded-lg border bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{name}</span>
        <span
          className={`text-xs ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}
        >
          {change >= 0 ? "+" : ""}
          {change.toFixed(1)} kg
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-2 h-10 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${name} estimated 1RM trend: ${first.toFixed(1)} to ${latest.toFixed(1)} kg`}
      >
        <polyline
          points={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <p className="mt-1 text-xs text-muted">
        {latest.toFixed(1)} kg now · {points.length} sessions
        {first > 0 && ` · ${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}
      </p>
    </div>
  );
}
