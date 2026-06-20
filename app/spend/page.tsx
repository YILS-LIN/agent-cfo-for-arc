import { SpendPage } from "@/components/workspace/spend-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { arcSpendAdapter, LiveArcAdapterUnavailableError } from "@/lib/arc/client";
import { demoPayments } from "@/lib/demo/mock-payments";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string }>;
}) {
  const { wallet } = await searchParams;
  let summary = buildAgentSpendSummary();
  let payments = demoPayments;

  if (wallet) {
    try {
      summary = await arcSpendAdapter.getAgentSummary(wallet);
      payments = summary.payments;
    } catch (error) {
      if (!(error instanceof LiveArcAdapterUnavailableError)) throw error;
    }
  }

  return <SpendPage summary={summary} payments={payments} />;
}
