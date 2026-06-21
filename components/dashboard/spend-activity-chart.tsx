import type { PaymentEvent } from "@/types/payment";
import { buildSpendActivityPoints } from "@/lib/analytics/chart-series";
import { formatCurrency } from "@/lib/utils";

export function SpendActivityChart({
  payments,
  from,
  to,
}: {
  payments: PaymentEvent[];
  from: string;
  to: string;
}) {
  const points = buildSpendActivityPoints(payments, from, to);
  const width = 720;
  const height = 230;
  const left = 54;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const max = Math.max(...points.map((point) => point.value), 0);
  const ceiling = max || 1;
  const coordinates = points.map((point, index) => ({
    x: left + (index / (points.length - 1)) * plotWidth,
    y: top + plotHeight - (point.value / ceiling) * plotHeight,
    ...point,
  }));
  const line = coordinates
    .map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${line} L ${coordinates.at(-1)?.x ?? left} ${top + plotHeight} L ${left} ${top + plotHeight} Z`;

  return (
    <section className="dashboard-card dashboard-enter rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Spend activity</h2>
          <p className="mt-1 text-xs text-muted">
            Observed USDC payments across the selected reporting window
          </p>
        </div>
        <p className="text-xs font-semibold text-muted">
          {payments.length} persisted or demo events
        </p>
      </div>
      {payments.length === 0 ? (
        <div className="mt-4 flex min-h-44 items-center justify-center rounded-lg border border-dashed border-line bg-subtle text-sm text-muted">
          No payment activity in this reporting window.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <svg
            className="h-auto min-w-[620px] w-full"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby="spend-chart-title spend-chart-description"
          >
            <title id="spend-chart-title">USDC spend activity</title>
            <desc id="spend-chart-description">
              Seven-period line chart derived from the currently displayed payment events.
            </desc>
            <defs>
              <linearGradient id="spend-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.24" />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((ratio) => {
              const y = top + plotHeight * ratio;
              return (
                <line
                  key={ratio}
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray="4 5"
                />
              );
            })}
            <text x={left - 8} y={top + 4} textAnchor="end" className="fill-muted text-[10px]">
              {formatCurrency(max)}
            </text>
            <text
              x={left - 8}
              y={top + plotHeight / 2 + 4}
              textAnchor="end"
              className="fill-muted text-[10px]"
            >
              {formatCurrency(max / 2)}
            </text>
            <text
              x={left - 8}
              y={top + plotHeight + 4}
              textAnchor="end"
              className="fill-muted text-[10px]"
            >
              $0
            </text>
            <path d={area} fill="url(#spend-area)" className="chart-area" />
            <path
              d={line}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              className="chart-line"
            />
            {coordinates.map((point) => (
              <g key={`${point.label}-${point.x}`}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="white"
                  stroke="var(--blue)"
                  strokeWidth="2"
                />
                <title>{`${point.label}: ${formatCurrency(point.value)} across ${point.payments} payments`}</title>
              </g>
            ))}
            {coordinates.map((point, index) =>
              index % 2 === 0 || index === coordinates.length - 1 ? (
                <text
                  key={point.x}
                  x={point.x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-muted text-[10px]"
                >
                  {point.label}
                </text>
              ) : null,
            )}
          </svg>
        </div>
      )}
    </section>
  );
}
