import { WalletsPage } from "@/components/workspace/wallets-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <WalletsPage summary={buildAgentSpendSummary()} />;
}
