import React from 'react';

/**
 * TrendChart (FR-8.9) - dependency-free SVG line chart.
 *
 * Renders a revenue/profit trend with axis labels, a polyline and
 * per-point dots. Accepts paise amounts and formats them in Indian
 * lakh/crore notation. Server-renderable (no hooks, no client JS).
 */

export interface TrendChartPoint {
  label: string;
  valuePaise: string | number | bigint;
}

interface TrendChartProps {
  data: TrendChartPoint[];
  height?: number;
  color?: string;
  /** Chart title shown above the plot. */
  title?: string;
  /** Value formatter; defaults to Indian rupee lakh/crore formatting. */
  formatValue?: (paise: number) => string;
}

function formatRupeesCompact(paise: number): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}Rs ${(abs / 1_00_00_000).toFixed(1)} Cr`;
  if (abs >= 1_00_000) return `${sign}Rs ${(abs / 1_00_000).toFixed(1)} L`;
  if (abs >= 1_000) return `${sign}Rs ${(abs / 1_000).toFixed(0)}k`;
  return `${sign}Rs ${abs.toFixed(0)}`;
}

export function TrendChart({
  data,
  height = 240,
  color = '#2563eb',
  title,
  formatValue = formatRupeesCompact,
}: TrendChartProps) {
  const width = 760;
  const padTop = 18;
  const padRight = 70;
  const padBottom = 34;
  const padLeft = 14;
  const plotW = Math.max(10, width - padLeft - padRight);
  const plotH = Math.max(10, height - padTop - padBottom);

  const values = data.map((d) => Number(d.valuePaise));
  const maxVal = Math.max(0, ...values);
  const minVal = Math.min(0, ...values);
  const range = maxVal - minVal || 1;

  const x = (i: number) =>
    data.length <= 1 ? padLeft + plotW / 2 : padLeft + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padTop + plotH - ((v - minVal) / range) * plotH;

  const points = data.map((d, i) => ({ cx: x(i), cy: y(Number(d.valuePaise)) }));
  const polyline = points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');

  // 4 horizontal gridlines with axis value labels.
  const gridlines = [0, 1, 2, 3].map((step) => {
    const t = step / 3;
    const gy = padTop + plotH - t * plotH;
    const gVal = minVal + t * range;
    return { gy, label: formatValue(gVal) };
  });

  const areaPath =
    points.length > 1
      ? `M ${padLeft},${(padTop + plotH).toFixed(1)} L ${polyline.split(' ').join(' L ')} L ${(padLeft + plotW).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
      : '';

  return (
    <div className="w-full">
      {title && (
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{title}</p>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={title || 'Trend chart'}
      >
        {/* Gridlines + y-axis labels */}
        {gridlines.map((g, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={g.gy}
              y2={g.gy}
              stroke="#E2E8F0"
              strokeWidth={1}
            />
            <text
              x={padLeft + plotW + 6}
              y={g.gy + 3}
              fontSize={10}
              fill="#94A3B8"
              fontFamily="ui-sans-serif, system-ui"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Filled area under the line */}
        {areaPath && <path d={areaPath} fill={color} opacity={0.08} />}

        {/* The line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Dots + x-axis labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r={4} fill="#ffffff" stroke={color} strokeWidth={2} />
            <circle cx={p.cx} cy={p.cy} r={1.8} fill={color} />
            <text
              x={p.cx}
              y={height - 12}
              fontSize={10}
              fill="#64748B"
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui"
            >
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
