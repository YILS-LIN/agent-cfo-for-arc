import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { ingestPaymentRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";
import { readJsonBody } from "@/lib/application/request-security";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "payment.ingest", { limit: 300 });
    const input = ingestPaymentRequestSchema.parse(
      await readJsonBody(request, { maxBytes: 256 * 1024 }),
    );
    const result = await getWorkspaceApplicationService().ingestPayment(context, input);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
