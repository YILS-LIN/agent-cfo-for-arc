import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { buildPublicJwksFromEnvironment } from "@/lib/mcp/jwks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await buildPublicJwksFromEnvironment(), {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
