import { SpendPage } from "@/components/workspace/spend-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { demoPayments } from "@/lib/demo/mock-payments";

export default function Page() {
  return <SpendPage summary={buildAgentSpendSummary()} payments={demoPayments} />;
}
