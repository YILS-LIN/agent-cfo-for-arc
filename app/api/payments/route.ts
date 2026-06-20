import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { listPaymentsQuerySchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const url = new URL(request.url);
    const filters = listPaymentsQuerySchema.parse(Object.fromEntries(url.searchParams));
    const payments = await getWorkspaceApplicationService().listPayments(context, filters);
    return NextResponse.json({ payments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
