import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { updateWalletRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { assertSameOrigin, readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    const { id } = await params;
    updateWalletRequestSchema.parse(await readJsonBody(request));
    const wallet = await getWorkspaceApplicationService().setPrimaryWallet(
      context,
      id,
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json({ wallet });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    assertSameOrigin(request);
    const { id } = await params;
    const wallet = await getWorkspaceApplicationService().archiveWallet(
      context,
      id,
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json({ wallet });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
