import { NextResponse } from "next/server";

import { buildMcpProtectedResourceMetadata } from "@/lib/mcp/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildMcpProtectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
