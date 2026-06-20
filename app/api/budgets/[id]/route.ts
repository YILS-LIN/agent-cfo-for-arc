import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { updateBudgetRequestSchema } from "@/lib/application/api-validation";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    const { id } = await params;
    const input = updateBudgetRequestSchema.parse(await request.json());
    const budget = await getWorkspaceApplicationService().updateBudgetAmount(context, {
      budgetId: id,
      ...input,
    });
    return NextResponse.json({ budget });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
