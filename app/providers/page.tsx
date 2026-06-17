import { ProvidersPage } from "@/components/workspace/providers-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <ProvidersPage summary={buildAgentSpendSummary()} />;
}
