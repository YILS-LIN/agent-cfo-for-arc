import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const policies = await getWorkspaceApplicationService().listProviderPolicies(context);
    return NextResponse.json({ policies }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
