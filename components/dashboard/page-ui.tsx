import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("dashboard-card rounded-lg p-4", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-bold">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function SummaryStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "orange" | "red";
}) {
  const tones = {
    blue: "bg-blue-soft text-blue",
    green: "bg-green/10 text-green",
    orange: "bg-orange/10 text-orange",
    red: "bg-red/10 text-red",
  };

  return (
    <article className="dashboard-card rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
          {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
        </div>
        <span className={cn("flex size-9 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="size-4" />
        </span>
      </div>
    </article>
  );
}

export function ProgressBar({
  value,
  tone = "blue",
}: {
  value: number;
  tone?: "blue" | "green" | "orange" | "red";
}) {
  const colors = {
    blue: "bg-blue",
    green: "bg-green",
    orange: "bg-orange",
    red: "bg-red",
  };

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-slate-100"
      aria-label={`${Math.round(value * 10) / 10}%`}
    >
      <div
        className={cn("h-full rounded-full", colors[tone])}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

export const inputClassName =
  "h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-blue focus:ring-2 focus:ring-blue/10";
