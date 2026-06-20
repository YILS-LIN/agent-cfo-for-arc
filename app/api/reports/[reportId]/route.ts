import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { getAuthService } from "@/lib/auth/server";
import { getReportService } from "@/lib/reports/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    const { reportId } = await params;
    return NextResponse.json(
      { report: await getReportService().get(context, reportId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
