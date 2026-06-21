import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { generateReportRequestSchema } from "@/lib/application/api-validation";
import { getAuthService } from "@/lib/auth/server";
import { getReportService } from "@/lib/reports/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "report.generate", {
      limit: 10,
      windowMs: 10 * 60_000,
    });
    const input = generateReportRequestSchema.parse(await readJsonBody(request));
    const rangeEnd = input.rangeEnd ?? new Date();
    const rangeStart = input.rangeStart ?? new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const result = await getReportService().generate(
      context,
      { provider: input.provider, rangeStart, rangeEnd },
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
