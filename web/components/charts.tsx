/**
 * Charts SVG simples sans dépendance externe (recharts, chart.js, etc.).
 *
 * Composants :
 *  - <Sparkline /> : courbe ligne minimaliste pour évolution dans le temps
 *  - <DonutChart /> : donut avec segments colorés + label central
 *  - <BarChart />   : barres horizontales pour comparer plusieurs valeurs
 *
 * Tous server-component-safe (pas de "use client"). Les SVG s'adaptent
 * via viewBox + width/height.
 */

type SparklinePoint = { x: number | string; y: number };

export function Sparkline({
  data,
  height = 60,
  stroke = "#fbbf24",
  fill = "rgba(251,191,36,0.15)",
  showDots = false,
  ariaLabel = "Courbe d'évolution",
}: {
  data: SparklinePoint[];
  height?: number;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
  ariaLabel?: string;
}) {
  if (data.length < 2) {
    return (
      <div className="text-[10px] italic text-zinc-500">
        Pas assez de données.
      </div>
    );
  }
  const ys = data.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const W = 200;
  const H = height;
  const stepX = W / (data.length - 1);
  const points = data.map((p, i) => ({
    x: i * stepX,
    y: H - ((p.y - minY) / range) * H * 0.85 - H * 0.05,
  }));
  const path = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");
  // Aire sous la courbe pour le fill.
  const areaPath = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <path d={areaPath} fill={fill} />
      <path d={path} stroke={stroke} strokeWidth="2" fill="none" />
      {showDots
        ? points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2"
              fill={stroke}
            />
          ))
        : null}
    </svg>
  );
}

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

export function DonutChart({
  segments,
  size = 140,
  thickness = 22,
  centerLabel,
  centerSubLabel,
  ariaLabel = "Donut chart",
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSubLabel?: string;
  ariaLabel?: string;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  if (total === 0) {
    return (
      <div className="text-[10px] italic text-zinc-500">
        Pas de données.
      </div>
    );
  }
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative inline-block">
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={thickness}
        />
        {segments.map((s, i) => {
          const len = (s.value / total) * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>
                {s.label} : {s.value} ({Math.round((s.value / total) * 100)}%)
              </title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      {centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-2xl font-bold tabular-nums text-zinc-100">
            {centerLabel}
          </div>
          {centerSubLabel ? (
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">
              {centerSubLabel}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type BarItem = {
  label: string;
  value: number;
  color?: string;
};

export function BarChart({
  items,
  max,
  ariaLabel = "Bar chart",
}: {
  items: BarItem[];
  max?: number;
  ariaLabel?: string;
}) {
  const computedMax = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div role="img" aria-label={ariaLabel} className="flex flex-col gap-1.5">
      {items.map((it, i) => {
        const ratio = it.value / computedMax;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className="w-24 truncate text-[11px] text-zinc-400">
              {it.label}
            </div>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-white/5">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${ratio * 100}%`,
                  background: it.color ?? "rgb(251 191 36)",
                }}
              />
            </div>
            <div className="w-12 text-right text-[11px] font-bold tabular-nums text-zinc-200">
              {it.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
