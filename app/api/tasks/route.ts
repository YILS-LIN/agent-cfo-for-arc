import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { createTaskRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    const tasks = await getWorkspaceApplicationService().listTasks(context);
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const input = createTaskRequestSchema.parse(await readJsonBody(request));
    const result = await getWorkspaceApplicationService().createTask(
      context,
      input,
      request.headers.get("Idempotency-Key") ?? "",
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
