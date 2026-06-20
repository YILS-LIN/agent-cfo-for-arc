import { ReportsPage } from "@/components/workspace/reports-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <ReportsPage summary={buildAgentSpendSummary()} />;
}
