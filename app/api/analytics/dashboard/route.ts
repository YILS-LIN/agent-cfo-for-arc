import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { workspaceSummaryQuerySchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const url = new URL(request.url);
    const input = workspaceSummaryQuerySchema.parse(Object.fromEntries(url.searchParams));
    const rangeEnd = input.rangeEnd ?? new Date();
    const rangeStart = input.rangeStart ?? new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const summary = await getWorkspaceApplicationService().getWorkspaceDashboard(context, {
      rangeStart,
      rangeEnd,
    });
    return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
