import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { readJsonBody } from "@/lib/application/request-security";
import { getOAuthClientRegistrationService } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const client = await getOAuthClientRegistrationService().register(await readJsonBody(request));
    return NextResponse.json(client, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
