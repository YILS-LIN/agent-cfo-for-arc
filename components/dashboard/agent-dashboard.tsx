"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clipboard,
  Code2,
  Database,
  FileText,
  Layers3,
  Loader2,
  PieChart,
  RefreshCw,
  Server,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { ProviderMark } from "@/components/dashboard/provider-mark";
import { AppShell } from "@/components/dashboard/app-shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import { ARC_TESTNET_EXPLORER, VERIFIED_EVIDENCE_WALLET } from "@/lib/arc/evidence-config";
import type { UsdcAmount } from "@/lib/domain/usdc";
import { cn, compactAddress, formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary, TaskSummary } from "@/types/agent";
import type { CategorySummary, PaymentEvent, RiskSeverity } from "@/types/payment";

type AgentDashboardProps = {
  initialSummary: AgentSpendSummary;
};

const categoryIcons = {
  APIs: Code2,
  Data: Database,
  Models: Sparkles,
  "Creator Content": FileText,
  Compute: Server,
  Storage: Layers3,
};

const categoryColors = {
  APIs: "bg-blue text-blue",
  Data: "bg-violet text-violet",
  Models: "bg-cyan text-cyan",
  "Creator Content": "bg-orange text-orange",
  Compute: "bg-indigo-500 text-indigo-500",
  Storage: "bg-slate-400 text-slate-500",
};

function WalletAnalyzer({
  wallet,
  isLoading,
  status,
  onWalletChange,
  onAnalyze,
}: {
  wallet: string;
  isLoading: boolean;
  status: string;
  onWalletChange: (wallet: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <section className="dashboard-card relative overflow-hidden rounded-lg p-4">
      <div className="soft-grid absolute inset-y-0 left-0 w-64 opacity-80" />
      <div className="absolute left-14 top-5 size-20 rounded-full border border-blue/10" />
      <div className="absolute left-23 top-13 size-3 rounded-full bg-violet/30" />
      <div className="relative grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)_auto] lg:items-center">
        <div className="flex justify-center lg:justify-start">
          <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan/25 via-white to-violet/20 shadow-[0_0_40px_rgba(72,87,255,0.25)]">
            <div className="absolute inset-3 rounded-full border border-blue/15" />
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-blue to-violet text-white shadow-[0_12px_24px_rgba(65,85,255,0.35)]">
              <CircleDollarSign className="size-6" />
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-bold" htmlFor="wallet">
              Agent Wallet Address
            </label>
            <button
              type="button"
              className="text-[11px] font-semibold text-blue hover:underline"
              onClick={() => onWalletChange(VERIFIED_EVIDENCE_WALLET)}
            >
              Use verified Arc sample
            </button>
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5">
            <input
              id="wallet"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={wallet}
              onChange={(event) => onWalletChange(event.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="text-muted hover:text-blue"
              aria-label="Copy wallet address"
              onClick={() => navigator.clipboard?.writeText(wallet)}
            >
              <Clipboard className="size-4" />
            </button>
          </div>
          <p className="mt-1.5 truncate text-[11px] text-muted">{status}</p>
        </div>
        <Button className="h-10 px-5" disabled={isLoading} onClick={onAnalyze}>
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Analyze Wallet
        </Button>
      </div>
    </section>
  );
}

function SpendFlow({
  categories,
  totalSpend,
}: {
  categories: CategorySummary[];
  totalSpend: UsdcAmount;
}) {
  return (
    <section className="dashboard-card rounded-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold">Spend Flow</h2>
        <span className="text-xs text-muted">x402 services by category</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(160px,220px)_minmax(0,1fr)] lg:items-center">
        <div className="relative flex min-h-40 items-center justify-center">
          <div className="absolute size-36 rounded-full bg-gradient-to-br from-cyan/20 via-white to-violet/20 blur-sm" />
          <div className="relative flex size-28 flex-col items-center justify-center rounded-full border border-blue/15 bg-white shadow-[0_0_35px_rgba(82,91,255,0.18)]">
            <WalletCards className="mb-1 size-6 text-muted" />
            <span className="text-xs font-semibold">Agent Wallet</span>
            <span className="mt-1 text-sm font-bold text-blue">{formatCurrency(totalSpend)}</span>
          </div>
        </div>
        <div className="grid gap-2">
          {categories.map((category, index) => {
            const Icon = categoryIcons[category.category];
            const colors = categoryColors[category.category];

            return (
              <div
                key={category.category}
                className="grid grid-cols-[minmax(0,1fr)_110px_58px] items-center gap-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-opacity-10",
                      colors,
                    )}
                  >
                    <span
                      className="absolute -left-28 top-1/2 hidden h-px w-24 origin-right lg:block"
                      style={{
                        background: `linear-gradient(90deg, transparent, currentColor)`,
                        transform: `translateY(-50%) rotate(${index * 9 - 22}deg)`,
                        opacity: 0.55,
                      }}
                    />
                    <Icon className="size-4" />
                  </span>
                  <span className="truncate font-semibold">{category.category}</span>
                </div>
                <span className="text-right font-medium">{formatCurrency(category.amount)}</span>
                <span className="text-right font-semibold" style={{ color: "currentColor" }}>
                  {formatPercent(category.share)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RecentPayments({ payments, wallet }: { payments: PaymentEvent[]; wallet: string }) {
  return (
    <section className="dashboard-card overflow-hidden rounded-lg p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold">Recent Payments</h2>
        <Link
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue"
          href={`/spend?wallet=${encodeURIComponent(wallet)}`}
        >
          View all payments
          <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-3 font-semibold">Provider</th>
              <th className="pb-3 font-semibold">Category</th>
              <th className="pb-3 font-semibold">Task</th>
              <th className="pb-3 text-right font-semibold">Amount (USDC)</th>
              <th className="pb-3 text-right font-semibold">Evidence</th>
              <th className="pb-3 text-right font-semibold">Time</th>
              <th className="pb-3 text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-t border-line/70">
                <td className="py-1.5">
                  <div className="flex items-center gap-2 font-semibold">
                    <ProviderMark provider={payment.provider} />
                    {payment.provider}
                  </div>
                </td>
                <td className="py-1.5">
                  <span className="rounded-md bg-blue-soft px-2 py-1 text-xs font-semibold text-blue">
                    {payment.category}
                  </span>
                </td>
                <td className="max-w-56 truncate py-1.5 text-muted">{payment.taskName}</td>
                <td className="py-1.5 text-right font-medium">{formatCurrency(payment.amount)}</td>
                <td className="py-1.5 text-right text-xs">
                  {payment.source === "demo" ? (
                    <span className="text-muted">Demo fixture</span>
                  ) : (
                    <a
                      className="font-semibold text-blue hover:underline"
                      href={`${ARC_TESTNET_EXPLORER}/tx/${payment.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Arc tx ↗
                    </a>
                  )}
                </td>
                <td className="py-1.5 text-right text-xs text-muted">
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(payment.timestamp))}
                </td>
                <td className="py-1.5 text-right">
                  <span className="inline-flex items-center gap-1 rounded-md bg-green/10 px-2 py-1 text-xs font-semibold text-green">
                    <CheckCircle2 className="size-3" />
                    Completed
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProvidersPanel({ summary }: { summary: AgentSpendSummary }) {
  return (
    <section className="dashboard-card rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Top Providers / Top Payees</h2>
        <button className="text-xs font-semibold text-blue" type="button">
          View all
        </button>
      </div>
      <div className="grid gap-2.5">
        {summary.providers.slice(0, 5).map((provider, index) => (
          <div
            key={provider.provider}
            className="grid grid-cols-[20px_minmax(0,1fr)_auto_48px] items-center gap-3 text-sm"
          >
            <span className="text-xs font-semibold text-muted">{index + 1}</span>
            <div className="flex min-w-0 items-center gap-2">
              <ProviderMark provider={provider.provider} />
              <span className="truncate font-semibold">{provider.provider}</span>
            </div>
            <span className="text-right font-medium">{formatCurrency(provider.amount)}</span>
            <span className="text-right text-xs text-muted">{formatPercent(provider.share)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function severityClasses(severity: RiskSeverity) {
  if (severity === "High") {
    return "border-red/20 bg-red/5 text-red";
  }

  if (severity === "Medium") {
    return "border-orange/20 bg-orange/5 text-orange";
  }

  return "border-blue/20 bg-blue/5 text-blue";
}

function RisksPanel({ summary }: { summary: AgentSpendSummary }) {
  return (
    <section className="dashboard-card rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Risks / Anomalies</h2>
        <button className="text-xs font-semibold text-blue" type="button">
          View all
        </button>
      </div>
      <div className="grid gap-2">
        {summary.risks.map((risk) => (
          <div
            key={risk.id}
            className={cn(
              "grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2 rounded-lg border p-2",
              severityClasses(risk.severity),
            )}
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-current/10">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">{risk.title}</p>
              <p className="truncate text-xs text-muted">{risk.description}</p>
            </div>
            <span className="self-start rounded-full bg-white px-2 py-1 text-xs font-semibold">
              {risk.severity}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskPanel({ task }: { task?: TaskSummary }) {
  if (!task) {
    return null;
  }

  return (
    <section className="dashboard-card rounded-lg p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold">Task-Level Spend Summary</h2>
        <ChevronRight className="size-5 text-blue" />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-sm font-bold">{task.name}</p>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-muted">
          {task.id.replace("_", "-")}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_1fr_64px] items-center gap-4">
        <div>
          <p className="text-xs text-muted">Total Spend</p>
          <p className="mt-1 text-2xl font-semibold">{formatCurrency(task.amount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Share of Total</p>
          <p className="mt-1 text-2xl font-semibold">{formatPercent(task.share)}</p>
        </div>
        <div className="relative size-12 rounded-full border-[6px] border-line">
          <span
            className="absolute -inset-[6px] rounded-full border-[6px] border-blue"
            style={{ clipPath: "polygon(50% 0, 100% 0, 100% 55%, 50% 50%)" }}
          />
        </div>
      </div>
    </section>
  );
}

function AiInsight({ summary }: { summary: AgentSpendSummary }) {
  return (
    <section className="dashboard-card overflow-hidden rounded-lg border-blue/20 bg-blue-soft/50 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-blue">
        <Sparkles className="size-4" />
        AI Insight
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_64px] items-center gap-4">
        <p className="text-sm font-semibold leading-6">
          {summary.report.headline}
          <br />
          <span className="text-blue">{summary.report.recommendation}</span>
        </p>
        <div className="flex size-16 items-center justify-center rounded-full bg-white shadow-[0_10px_35px_rgba(52,101,255,0.18)]">
          <Sparkles className="size-8 text-violet" />
        </div>
      </div>
    </section>
  );
}

export function AgentDashboard({ initialSummary }: AgentDashboardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [wallet, setWallet] = useState(initialSummary.profile.wallet);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(
    initialSummary.analysis.isLive
      ? "LIVE EVIDENCE · Circle Gateway settlement verified against Arc Testnet."
      : "DEMO · Deterministic local payment facts; no live Arc sync.",
  );

  const metrics = useMemo(
    () => [
      {
        label: "Total Spend",
        value: formatCurrency(summary.metrics.totalSpend),
        icon: WalletCards,
        trend: [4, 8, 6, 12, 5, 13, 12, 18],
      },
      {
        label: "Payments",
        value: summary.metrics.paymentCount.toLocaleString("en-US"),
        icon: RefreshCw,
        trend: [5, 10, 8, 13, 7, 12, 9, 16],
      },
      {
        label: "Avg Payment",
        value: formatCurrency(summary.metrics.averagePayment),
        icon: CircleDollarSign,
        trend: [6, 11, 16, 7, 10, 12, 18, 9, 13],
      },
      {
        label: "Budget Used",
        value: formatPercent(summary.metrics.budgetUsed),
        icon: PieChart,
        trend: [7, 10, 12, 9, 15, 13, 18, 20],
      },
    ],
    [summary],
  );

  async function analyzeWallet() {
    setIsLoading(true);
    setStatus("Checking the configured analysis adapter...");

    try {
      const response = await fetch(`/api/agents/${encodeURIComponent(wallet)}/summary`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to analyze wallet.");
      }

      const nextSummary = (await response.json()) as AgentSpendSummary;
      setSummary(nextSummary);
      setStatus(
        nextSummary.analysis.isLive
          ? `LIVE EVIDENCE · Circle Gateway + Arc Testnet verified at ${new Date(nextSummary.analysis.calculatedAt).toLocaleTimeString()}.`
          : `DEMO · Recalculated ${compactAddress(nextSummary.profile.wallet)} from local fixtures.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to analyze wallet.");
    } finally {
      setIsLoading(false);
    }
  }

  async function runDemoAgent() {
    setIsLoading(true);
    setStatus("Running demo research agent and generating nanopayment events...");

    try {
      const response = await fetch("/api/demo/run-agent", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Demo agent run failed.");
      }

      const payload = (await response.json()) as {
        eventsGenerated: number;
        summary: AgentSpendSummary;
      };
      setSummary(payload.summary);
      setWallet(payload.summary.profile.wallet);
      setStatus(`Demo agent completed. ${payload.eventsGenerated} x402-style payments generated.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Demo agent run failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AppShell
      title="Agent CFO for Arc"
      description="Deterministic spend-analysis demo · live Arc adapter pending"
      owner={summary.profile.owner}
      actions={
        <Button disabled={isLoading} onClick={runDemoAgent} variant="soft">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Run Demo Agent
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="grid gap-4">
          <WalletAnalyzer
            wallet={wallet}
            isLoading={isLoading}
            status={status}
            onWalletChange={setWallet}
            onAnalyze={analyzeWallet}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>

          <SpendFlow categories={summary.categories} totalSpend={summary.metrics.totalSpend} />
          <RecentPayments payments={summary.payments} wallet={summary.profile.wallet} />
        </div>

        <aside className="grid content-start gap-4">
          <ProvidersPanel summary={summary} />
          <RisksPanel summary={summary} />
          <TaskPanel task={summary.tasks[0]} />
          <AiInsight summary={summary} />
        </aside>
      </div>
    </AppShell>
  );
}
