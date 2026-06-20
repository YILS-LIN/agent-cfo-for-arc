import { AgentDashboard } from "@/components/dashboard/agent-dashboard";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { arcSpendAdapter, LiveArcAdapterUnavailableError } from "@/lib/arc/client";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>;
}) {
  const { wallet } = await searchParams;
  let summary = buildAgentSpendSummary();
  if (wallet) {
    try {
      summary = await arcSpendAdapter.getAgentSummary(wallet);
    } catch (error) {
      if (!(error instanceof LiveArcAdapterUnavailableError)) throw error;
    }
  }

  return <AgentDashboard initialSummary={summary} />;
}
