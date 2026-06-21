import { getBudgetUsed, getTaskSummaries } from "@/lib/analytics/budget";
import { buildSpendActivityPoints } from "@/lib/analytics/chart-series";
import {
  getRecentPayments,
  getTotalSpend,
  summarizeCategories,
  summarizeProviders,
} from "@/lib/analytics/classify-spend";
import { detectRiskSignals, getRiskLevel } from "@/lib/analytics/risk";
import { demoPayments, demoProfile } from "@/lib/demo/mock-payments";
import { divideUsdc } from "@/lib/domain/usdc";
import { generateCfoReport } from "@/lib/reports/generate-cfo-report";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

type BuildSummaryOptions = {
  wallet?: string;
  payments?: PaymentEvent[];
  source?: "demo" | "arc";
  profile?: Partial<AgentSpendSummary["profile"]>;
};

export function buildAgentSpendSummary(options: BuildSummaryOptions = {}): AgentSpendSummary {
  const payments = options.payments ?? demoPayments;
  const paymentTimestamps = payments
    .map((payment) => new Date(payment.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  const inferredDateRange = {
    from: paymentTimestamps[0]?.toISOString().slice(0, 10) ?? demoProfile.dateRange.from,
    to: paymentTimestamps.at(-1)?.toISOString().slice(0, 10) ?? demoProfile.dateRange.to,
  };
  const profile = {
    ...demoProfile,
    ...options.profile,
    wallet: options.wallet?.trim() || demoProfile.wallet,
    dateRange:
      options.profile?.dateRange ?? (options.payments ? inferredDateRange : demoProfile.dateRange),
  };
  const totalSpend = getTotalSpend(payments);
  const providers = summarizeProviders(payments);
  const categories = summarizeCategories(payments);
  const budgetUsed = getBudgetUsed(totalSpend, profile.budget);
  const risks = detectRiskSignals(payments, budgetUsed);
  const tasks = getTaskSummaries(payments, totalSpend);
  const report = generateCfoReport({
    totalSpend,
    budgetUsed,
    providers,
    categories,
    tasks,
    risks,
  });

  return {
    analysis: {
      source: options.source ?? "demo",
      isLive: options.source === "arc",
      calculatedAt: new Date().toISOString(),
      version: options.source === "arc" ? "public-evidence-v1" : "demo-v1",
    },
    profile,
    metrics: {
      totalSpend,
      paymentCount: payments.length,
      averagePayment: divideUsdc(totalSpend, payments.length),
      budgetUsed,
      topCategory: categories[0]?.category ?? "Unknown",
      riskLevel: getRiskLevel(risks),
    },
    activity: buildSpendActivityPoints(payments, profile.dateRange.from, profile.dateRange.to),
    payments: getRecentPayments(payments, 6),
    providers,
    categories,
    risks,
    tasks,
    report,
  };
}
