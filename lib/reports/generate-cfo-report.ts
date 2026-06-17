import type { TaskSummary } from "@/types/agent";
import type { CategorySummary, ProviderSummary, RiskSignal } from "@/types/payment";
import type { CfoReport } from "@/types/report";

type GenerateCfoReportInput = {
  totalSpend: number;
  budgetUsed: number;
  providers: ProviderSummary[];
  categories: CategorySummary[];
  tasks: TaskSummary[];
  risks: RiskSignal[];
};

export function generateCfoReport(input: GenerateCfoReportInput): CfoReport {
  const topProvider = input.providers[0];
  const topCategory = input.categories[0];
  const topTask = input.tasks[0];
  const repeatedRisk = input.risks.find((risk) => risk.category === "repeat");
  const savings = repeatedRisk ? 31 : input.budgetUsed > 80 ? 14 : 8;

  return {
    id: `report_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    headline: repeatedRisk
      ? "This agent overspent on repeated dataset purchases."
      : "This agent stayed inside budget with moderate provider concentration.",
    summary: `The agent spent ${input.totalSpend.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    })} across ${input.providers.length} providers. Most spend went to ${topCategory?.category ?? "paid services"}, with ${topProvider?.provider ?? "the top provider"} receiving the largest share. The highest-cost task was ${topTask?.name ?? "the current research task"}.`,
    recommendation: repeatedRisk
      ? "Caching repeated dataset responses could reduce future task cost by approximately 31%."
      : "Set provider-specific budgets and cache high-cost responses before the next autonomous run.",
    projectedSavingsPercent: savings,
  };
}
