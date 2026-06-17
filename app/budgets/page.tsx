import { BudgetsPage } from "@/components/workspace/budgets-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <BudgetsPage summary={buildAgentSpendSummary()} />;
}
