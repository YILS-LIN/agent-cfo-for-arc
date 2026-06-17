import { NextResponse } from "next/server";

import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { demoPayments } from "@/lib/demo/mock-payments";

export async function POST() {
  const now = new Date();
  const simulatedPayments = demoPayments.map((payment, index) => ({
    ...payment,
    id: `demo_run_${index + 1}`,
    timestamp: new Date(now.getTime() - index * 1000 * 60 * 9).toISOString(),
  }));

  return NextResponse.json({
    runId: `run_${now.getTime()}`,
    status: "completed",
    eventsGenerated: simulatedPayments.length,
    summary: buildAgentSpendSummary({ payments: simulatedPayments }),
  });
}
