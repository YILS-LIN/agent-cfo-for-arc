import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { updateRiskStatusRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    const { id } = await params;
    const input = updateRiskStatusRequestSchema.parse(await readJsonBody(request));
    const risk = await getWorkspaceApplicationService().updateRiskStatus(
      context,
      { riskId: id, ...input },
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json({ risk });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
