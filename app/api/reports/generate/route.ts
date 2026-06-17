import { NextResponse } from "next/server";

import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { wallet?: string };
  const summary = buildAgentSpendSummary({ wallet: body.wallet });

  return NextResponse.json(summary.report);
}
