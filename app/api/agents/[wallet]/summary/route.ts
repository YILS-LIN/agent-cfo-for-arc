import { NextResponse } from "next/server";

import { demoArcAdapter } from "@/lib/arc/client";

type RouteContext = {
  params: Promise<{
    wallet: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { wallet } = await context.params;
  const summary = await demoArcAdapter.getAgentSummary(decodeURIComponent(wallet));

  return NextResponse.json(summary, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
