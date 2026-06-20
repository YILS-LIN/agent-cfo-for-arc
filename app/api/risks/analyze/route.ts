import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { analyzeRisksRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const input = analyzeRisksRequestSchema.parse(await request.json().catch(() => ({})));
    const rangeEnd = input.rangeEnd ?? new Date();
    const rangeStart = input.rangeStart ?? new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const result = await getWorkspaceApplicationService().analyzeRisks(context, {
      rangeStart,
      rangeEnd,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
