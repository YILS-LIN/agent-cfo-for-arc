import { NextResponse } from "next/server";

import { arcSpendAdapter, LiveArcAdapterUnavailableError } from "@/lib/arc/client";

type RouteContext = {
  params: Promise<{
    wallet: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { wallet } = await context.params;
  try {
    const summary = await arcSpendAdapter.getAgentSummary(decodeURIComponent(wallet));

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof LiveArcAdapterUnavailableError) {
      return NextResponse.json(
        { error: error.message, code: "LIVE_ARC_ADAPTER_UNAVAILABLE" },
        { status: 422 },
      );
    }

    throw error;
  }
}
