"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Line, LineChart, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";

import { MotionCard } from "@/components/dashboard/motion-card";
import { usePrefersReducedMotion } from "@/lib/client/reduced-motion";

type MetricCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  trend: number[];
  href: string;
  delay?: number;
  visual?: "line" | "gauge";
};

function AnimatedMetricValue({ value }: { value: string }) {
  const reduceMotion = usePrefersReducedMotion();
  const numericValue = Number(value.replace(/[^0-9.-]/g, ""));
  const prefix = value.startsWith("$") ? "$" : "";
  const suffix = value.endsWith("%") ? "%" : "";
  const decimals = value.includes(".") ? (value.split(".")[1]?.replace(/\D/g, "").length ?? 0) : 0;
  const motionValue = useMotionValue(numericValue);
  const previous = useRef(numericValue);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (!Number.isFinite(numericValue) || reduceMotion) return;

    motionValue.set(previous.current);
    const controls = animate(motionValue, numericValue, {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setDisplay(
          `${prefix}${latest.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}${suffix}`,
        );
      },
      onComplete: () => {
        previous.current = numericValue;
        setDisplay(value);
      },
    });

    return () => controls.stop();
  }, [decimals, motionValue, numericValue, prefix, reduceMotion, suffix, value]);

  return <motion.span aria-label={value}>{reduceMotion ? value : display}</motion.span>;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  href,
  delay = 0,
  visual = "line",
}: MetricCardProps) {
  const reduceMotion = usePrefersReducedMotion();
  const data = trend.map((point, index) => ({ index, value: point }));
  const gaugeValue = Math.min(100, Math.max(0, trend.at(-1) ?? 0));

  return (
    <MotionCard as="article" delay={delay} className="dashboard-card group min-w-0 rounded-lg p-3">
      <Link
        className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue/30"
        href={href}
      >
        <div className="flex items-start gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-white transition-transform group-hover:-translate-y-0.5">
            <Icon className="size-4 text-muted" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              <AnimatedMetricValue value={value} />
            </p>
          </div>
        </div>
        <div
          className="mt-2 h-7 w-full"
          role="img"
          aria-label={`${label} trend derived from displayed payments`}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            minHeight={28}
            initialDimension={{ width: 240, height: 28 }}
          >
            {visual === "gauge" ? (
              <RadialBarChart
                data={[{ value: gaugeValue }]}
                innerRadius="62%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                accessibilityLayer
              >
                <RadialBar
                  dataKey="value"
                  fill="var(--blue)"
                  background={{ fill: "var(--line)" }}
                  cornerRadius={8}
                  isAnimationActive={!reduceMotion}
                  animationDuration={650}
                />
              </RadialBarChart>
            ) : (
              <LineChart data={data} accessibilityLayer>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--blue)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reduceMotion}
                  animationDuration={650}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </Link>
    </MotionCard>
  );
}
