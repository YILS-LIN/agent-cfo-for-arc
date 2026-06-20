import type { AiReportContent } from "@/lib/ai/report-generator";
import type { AgentSpendSummary } from "@/types/agent";

export function buildLocalReport(summary: AgentSpendSummary): AiReportContent {
  const topProvider = summary.providers[0];
  const topCategory = summary.categories[0];
  return {
    headline: summary.report.headline,
    executiveSummary: summary.report.summary,
    findings: [
      {
        title: "Observed spend",
        evidence: `${summary.metrics.totalSpend} USDC across ${summary.metrics.paymentCount} persisted payments`,
        impact: `${summary.metrics.budgetUsed}% of the assigned budget was used in the reporting window`,
      },
      ...(topProvider
        ? [
            {
              title: "Provider concentration",
              evidence: `${topProvider.provider} received ${topProvider.amount} USDC (${topProvider.share}% of spend)`,
              impact: "Concentrated spend merits provider-level review and budgeting.",
            },
          ]
        : []),
      ...(topCategory
        ? [
            {
              title: "Top category",
              evidence: `${topCategory.category} accounted for ${topCategory.amount} USDC`,
              impact:
                "Category totals identify where future cost controls may have the most effect.",
            },
          ]
        : []),
    ],
    recommendations: [
      {
        action: summary.report.recommendation,
        rationale: "This recommendation is generated deterministically from the persisted summary.",
        priority: summary.metrics.riskLevel === "High" ? "high" : "medium",
      },
    ],
    caveats: [
      "Monitoring and provider decisions do not enforce onchain payment authorization.",
      "The report covers only payment events ingested inside the selected reporting range.",
    ],
  };
}
