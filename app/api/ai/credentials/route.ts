import { NextResponse } from "next/server";

import { getAiCredentialService } from "@/lib/ai/server";
import { apiErrorResponse } from "@/lib/application/api-errors";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const credentials = await getAiCredentialService().list(context);
    return NextResponse.json({ credentials }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
