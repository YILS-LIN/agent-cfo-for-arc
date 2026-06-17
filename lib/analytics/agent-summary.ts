import { getBudgetUsed, getTaskSummaries } from "@/lib/analytics/budget";
import {
  getRecentPayments,
  getTotalSpend,
  summarizeCategories,
  summarizeProviders,
} from "@/lib/analytics/classify-spend";
import { detectRiskSignals, getRiskLevel } from "@/lib/analytics/risk";
import { demoPayments, demoProfile } from "@/lib/demo/mock-payments";
import { generateCfoReport } from "@/lib/reports/generate-cfo-report";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

type BuildSummaryOptions = {
  wallet?: string;
  payments?: PaymentEvent[];
};

export function buildAgentSpendSummary(options: BuildSummaryOptions = {}): AgentSpendSummary {
  const payments = options.payments ?? demoPayments;
  const profile = {
    ...demoProfile,
    wallet: options.wallet?.trim() || demoProfile.wallet,
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
    profile,
    metrics: {
      totalSpend,
      paymentCount: 342,
      averagePayment: Math.round((totalSpend / 342) * 100) / 100,
      budgetUsed,
      topCategory: categories[0]?.category ?? "Unknown",
      riskLevel: getRiskLevel(risks),
    },
    payments: getRecentPayments(payments, 6),
    providers,
    categories,
    risks,
    tasks,
    report,
  };
}
