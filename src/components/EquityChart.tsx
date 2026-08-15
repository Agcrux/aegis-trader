/**
 * Dependency-free SVG line chart: account equity (emerald) vs. a normalized
 * benchmark (slate, dashed). Pure server component — no client JS shipped.
 */

export interface ChartSeries {
  points: number[];
  benchmark?: number[];
  labels?: string[];
}

export default function EquityChart({
  points,
  benchmark,
  height = 160,
}: ChartSeries & { height?: number }) {
  if (points.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-zinc-600">
        Not enough history yet — the chart grows with each engine run.
      </div>
    );
  }
  const w = 600;
  const h = height;
  const pad = 6;
  const all = benchmark ? [...points, ...benchmark] : points;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;

  const toPath = (series: number[]) =>
    series
      .map((v, i) => {
        const x = pad + (i / (series.length - 1)) * (w - pad * 2);
        const y = h - pad - ((v - min) / span) * (h - pad * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const last = points[points.length - 1];
  const first = points[0];
  const up = last >= first;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label={`Equity chart from ${first.toFixed(2)} to ${last.toFixed(2)}`}
    >
      {benchmark && benchmark.length > 1 ? (
        <path
          d={toPath(benchmark)}
          fill="none"
          stroke="#52525b"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      ) : null}
      <path
        d={toPath(points)}
        fill="none"
        stroke={up ? "#34d399" : "#fb7185"}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
