import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

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
    <article className="dashboard-card min-w-0 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white">
          <Icon className="size-4 text-muted" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-xl font-semibold">{value}</p>
        </div>
      </div>
      <div className="mt-2 flex h-4 items-end gap-1">
        {trend.map((point, index) => (
          <span
            key={`${point}-${index}`}
            className={cn(
              "h-1 rounded-full bg-blue transition-all",
              index === trend.length - 1 ? "w-6" : "w-5",
            )}
            style={{
              transform: `translateY(-${((point - min) / range) * 8}px)`,
              opacity: 0.45 + ((point - min) / range) * 0.45,
            }}
          />
        ))}
      </div>
    </article>
  );
}
