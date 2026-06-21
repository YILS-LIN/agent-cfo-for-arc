"use client";

import { useId, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MotionCard } from "@/components/dashboard/motion-card";
import { usePrefersReducedMotion } from "@/lib/client/reduced-motion";
import { cn, formatCurrency } from "@/lib/utils";
import type { SpendActivityPoint } from "@/types/agent";

type Measure = "amount" | "payments";

function formatAxisAmount(value: number) {
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

export function SpendActivityChart({
  activity,
  from,
  to,
}: {
  activity: SpendActivityPoint[];
  from: string;
  to: string;
}) {
  const [measure, setMeasure] = useState<Measure>("amount");
  const reduceMotion = usePrefersReducedMotion();
  const titleId = useId();
  const descriptionId = useId();
  const hasActivity = activity.some((point) => point.amount > 0 || point.payments > 0);
  const measureLabel = measure === "amount" ? "USDC spend" : "Payment count";

  return (
    <MotionCard className="dashboard-card rounded-lg p-4" delay={0.08}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" id={titleId}>
            Spend activity
          </h2>
          <p className="mt-1 text-xs text-muted" id={descriptionId}>
            {measureLabel} · {from} to {to} · {activity.length} reporting intervals
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-line bg-subtle p-1"
          role="group"
          aria-label="Chart measure"
        >
          {(["amount", "payments"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={measure === option}
              onClick={() => setMeasure(option)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold",
                measure === option
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option === "amount" ? "Spend" : "Payments"}
            </button>
          ))}
        </div>
      </div>

      {!hasActivity ? (
        <div className="mt-4 flex min-h-64 items-center justify-center rounded-lg border border-dashed border-line bg-subtle text-sm text-muted">
          No payment activity in this reporting window.
        </div>
      ) : (
        <div
          className="mt-4 h-64 min-w-0"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          aria-label="USDC spend activity"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={256}
            initialDimension={{ width: 720, height: 256 }}
          >
            <ComposedChart
              data={activity}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={{ stroke: "var(--line)" }}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                tickFormatter={measure === "amount" ? formatAxisAmount : (value) => String(value)}
                width={48}
                allowDecimals={measure === "amount"}
              />
              <Tooltip
                cursor={{ stroke: "var(--blue)", strokeOpacity: 0.25 }}
                contentStyle={{
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  boxShadow: "0 12px 36px rgba(32, 43, 72, 0.14)",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  measure === "amount"
                    ? formatCurrency(Number(value ?? 0))
                    : Number(value ?? 0).toLocaleString("en-US"),
                  measureLabel,
                ]}
              />
              {measure === "amount" && (
                <Area
                  type="monotone"
                  dataKey="amount"
                  fill="var(--blue)"
                  fillOpacity={0.08}
                  stroke="none"
                  isAnimationActive={!reduceMotion}
                  animationDuration={700}
                />
              )}
              <Line
                type="monotone"
                dataKey={measure}
                stroke="var(--blue)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "white", stroke: "var(--blue)", strokeWidth: 2 }}
                activeDot={{ r: 5, fill: "white", stroke: "var(--blue)", strokeWidth: 2 }}
                isAnimationActive={!reduceMotion}
                animationDuration={700}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </MotionCard>
  );
}
