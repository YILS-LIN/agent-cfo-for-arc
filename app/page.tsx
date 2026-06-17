import { AgentDashboard } from "@/components/dashboard/agent-dashboard";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>;
}) {
  const { wallet } = await searchParams;
  const summary = buildAgentSpendSummary({ wallet });

  return <AgentDashboard initialSummary={summary} />;
}
