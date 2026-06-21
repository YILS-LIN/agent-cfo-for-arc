import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { updateTaskStatusRequestSchema } from "@/lib/application/api-validation";
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
    const input = updateTaskStatusRequestSchema.parse(await readJsonBody(request));
    const task = await getWorkspaceApplicationService().updateTaskStatus(context, {
      taskId: id,
      ...input,
    });
    return NextResponse.json({ task });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
