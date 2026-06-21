"use client";

import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { motion } from "motion/react";
import { useId, useMemo } from "react";

import { MotionCard } from "@/components/dashboard/motion-card";
import { usePrefersReducedMotion } from "@/lib/client/reduced-motion";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { UsdcAmount } from "@/lib/domain/usdc";
import type { CategorySummary } from "@/types/payment";

type FlowNode = { name: string; amount: number; share: number; kind: "wallet" | "category" };
type FlowLink = { source: number; target: number; value: number };

const categoryColors = ["#2853d9", "#13a6b5", "#7b61ff", "#9a4d00", "#64748b"];

function normalizedCategories(categories: CategorySummary[]) {
  const head = categories.slice(0, 5).map((category) => ({
    name: category.category,
    amount: Number(category.amount),
    share: category.share,
  }));
  const tail = categories.slice(5);
  if (tail.length === 0) return head;
  const otherAmount = tail.reduce((total, category) => total + Number(category.amount), 0);
  return [
    ...head.slice(0, 4),
    {
      name: "Other",
      amount: otherAmount + (head[4]?.amount ?? 0),
      share: tail.reduce((total, category) => total + category.share, 0) + (head[4]?.share ?? 0),
    },
  ];
}

export function SpendFlowChart({
  categories,
  totalSpend,
}: {
  categories: CategorySummary[];
  totalSpend: UsdcAmount;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const reduceMotion = usePrefersReducedMotion();
  const width = 720;
  const height = 250;
  const rows = useMemo(() => normalizedCategories(categories), [categories]);
  const graph = useMemo(() => {
    if (rows.length === 0) return null;
    const nodes: FlowNode[] = [
      { name: "Agent wallet", amount: Number(totalSpend), share: 100, kind: "wallet" },
      ...rows.map((row) => ({ ...row, kind: "category" as const })),
    ];
    const links: FlowLink[] = rows.map((row, index) => ({
      source: 0,
      target: index + 1,
      value: row.amount,
    }));
    return sankey<FlowNode, FlowLink>()
      .nodeWidth(18)
      .nodePadding(14)
      .extent([
        [120, 12],
        [width - 126, height - 12],
      ])({ nodes: nodes.map((node) => ({ ...node })), links: links.map((link) => ({ ...link })) });
  }, [rows, totalSpend]);

  return (
    <MotionCard className="dashboard-card rounded-lg p-4" delay={0.12}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold" id={titleId}>
            Spend flow
          </h2>
          <p className="mt-1 text-xs text-muted" id={descriptionId}>
            How observed USDC spend is distributed across service categories
          </p>
        </div>
        <span className="rounded-full border border-blue/15 bg-blue-soft px-3 py-1 text-xs font-semibold text-blue">
          {formatCurrency(totalSpend)} observed
        </span>
      </div>
      {graph ? (
        <>
          <div
            className="mt-3 overflow-x-auto"
            tabIndex={0}
            aria-label="Scrollable spend flow chart"
          >
            <svg
              className="h-auto min-w-[620px] w-full"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              {graph.links.map((link, index) => {
                const source = link.source as FlowNode & { index?: number };
                const target = link.target as FlowNode & { index?: number };
                const categoryIndex = Math.max(0, Number(target.index) - 1);
                return (
                  <motion.path
                    key={`${source.index}-${target.index}`}
                    d={sankeyLinkHorizontal()(link) ?? undefined}
                    fill="none"
                    stroke={categoryColors[categoryIndex] ?? categoryColors.at(-1)}
                    strokeOpacity={0.18}
                    strokeWidth={Math.max(1, link.width ?? 1)}
                    initial={reduceMotion ? false : { opacity: 0, pathLength: 0 }}
                    animate={{ opacity: 1, pathLength: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.7, delay: index * 0.06 }}
                  >
                    <title>{`${target.name}: ${formatCurrency(link.value)} (${formatPercent(target.share)})`}</title>
                  </motion.path>
                );
              })}
              {graph.nodes.map((node, index) => {
                const isWallet = node.kind === "wallet";
                const color = isWallet
                  ? "#111318"
                  : (categoryColors[Math.max(0, index - 1)] ?? "#64748b");
                const x = isWallet ? (node.x0 ?? 0) - 12 : (node.x1 ?? 0) + 12;
                const anchor = isWallet ? "end" : "start";
                const centerY = ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2;
                return (
                  <g key={node.name}>
                    <motion.rect
                      x={node.x0}
                      y={node.y0}
                      width={(node.x1 ?? 0) - (node.x0 ?? 0)}
                      height={Math.max(1, (node.y1 ?? 0) - (node.y0 ?? 0))}
                      rx={4}
                      fill={color}
                      initial={reduceMotion ? false : { opacity: 0, scaleY: 0 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      style={{ transformOrigin: `${node.x0}px ${centerY}px` }}
                      transition={{ duration: reduceMotion ? 0 : 0.5, delay: index * 0.05 }}
                    >
                      <title>{`${node.name}: ${formatCurrency(node.amount)}`}</title>
                    </motion.rect>
                    <text
                      x={x}
                      y={centerY - 3}
                      textAnchor={anchor}
                      className="fill-foreground text-[11px] font-semibold"
                    >
                      {node.name}
                    </text>
                    <text
                      x={x}
                      y={centerY + 12}
                      textAnchor={anchor}
                      className="fill-muted text-[10px]"
                    >
                      {isWallet
                        ? formatCurrency(node.amount)
                        : `${formatCurrency(node.amount)} · ${formatPercent(node.share)}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="mt-3 grid gap-2 sm:hidden" aria-label="Spend flow category details">
            {rows.map((row, index) => (
              <div
                className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-xs"
                key={row.name}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: categoryColors[index] ?? categoryColors.at(-1) }}
                />
                <span className="truncate font-semibold">{row.name}</span>
                <span className="tabular-nums text-muted">
                  {formatCurrency(row.amount)} · {formatPercent(row.share)}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 flex min-h-52 items-center justify-center rounded-lg border border-dashed border-line bg-subtle text-sm text-muted">
          No categorized spend is available for this reporting window.
        </div>
      )}
    </MotionCard>
  );
}
