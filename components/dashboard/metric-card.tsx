import type { LucideIcon } from "lucide-react";

type MetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  trend: number[];
};

export function MetricCard({ label, value, icon: Icon, trend }: MetricCardProps) {
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = max - min || 1;

  return (
    <article className="dashboard-card dashboard-enter min-w-0 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white">
          <Icon className="size-4 text-muted" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      </div>
      <svg
        className="mt-2 h-5 w-full"
        viewBox="0 0 120 20"
        role="img"
        aria-label={`${label} trend derived from displayed payments`}
      >
        <polyline
          points={trend
            .map(
              (point, index) =>
                `${(index / Math.max(1, trend.length - 1)) * 118 + 1},${18 - ((point - min) / range) * 15}`,
            )
            .join(" ")}
          fill="none"
          stroke="var(--blue)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          className="chart-line"
        />
      </svg>
    </article>
  );
}
