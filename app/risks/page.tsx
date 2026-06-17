import { RisksPage } from "@/components/workspace/risks-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <RisksPage summary={buildAgentSpendSummary()} />;
}
