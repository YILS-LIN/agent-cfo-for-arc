import { NextResponse } from "next/server";

import { buildMcpAuthorizationServerMetadata } from "@/lib/mcp/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildMcpAuthorizationServerMetadata(), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
