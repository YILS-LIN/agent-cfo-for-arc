import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { internalPaymentIngestRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { readJsonBody } from "@/lib/application/request-security";
import { getInternalWorkspaceContext, verifyInternalJobRequest } from "@/lib/auth/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    verifyInternalJobRequest(request);
    const input = internalPaymentIngestRequestSchema.parse(
      await readJsonBody(request, { maxBytes: 256 * 1024 }),
    );
    const context = await getInternalWorkspaceContext(input.workspaceId);
    const result = await getWorkspaceApplicationService().ingestPayment(
      context,
      input.payment,
      "system",
    );
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
