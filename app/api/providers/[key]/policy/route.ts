import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { setProviderPolicyRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "workspace.mutation");
    const { key } = await params;
    const input = setProviderPolicyRequestSchema.parse(await readJsonBody(request));
    const policy = await getWorkspaceApplicationService().setProviderPolicy(context, {
      providerKey: key,
      ...input,
    });
    return NextResponse.json({ policy });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
