import { NextResponse } from "next/server";

import { authErrorResponse, getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    return NextResponse.json(context, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
