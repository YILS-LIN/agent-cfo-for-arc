import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { updateBudgetRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    const { id } = await params;
    return NextResponse.json(await getWorkspaceApplicationService().getBudget(context, id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    const { id } = await params;
    const input = updateBudgetRequestSchema.parse(await readJsonBody(request));
    const result = await getWorkspaceApplicationService().updateBudget(
      context,
      { budgetId: id, ...input },
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
