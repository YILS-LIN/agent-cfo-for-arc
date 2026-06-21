import { NextResponse } from "next/server";

import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { demoPayments } from "@/lib/demo/mock-payments";
import { apiErrorResponse } from "@/lib/application/api-errors";
import { enforceClientRateLimit } from "@/lib/security/server";

export async function POST(request: Request) {
  try {
    await enforceClientRateLimit(request, "demo.run", { limit: 30 });
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
  } catch (error) {
    return apiErrorResponse(error);
  }
}
