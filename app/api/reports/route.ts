import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { getAuthService } from "@/lib/auth/server";
import { getReportService } from "@/lib/reports/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const reports = await getReportService().list(context);
    return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
