import { NextResponse } from "next/server";

import { MCP_SUPPORTED_SCOPES, mcpAuthorizationServer, mcpPublicUrl } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const resource = `${mcpPublicUrl()}/mcp`;
  return NextResponse.json(
    {
      resource,
      resource_name: "Agent CFO for Arc MCP",
      authorization_servers: [mcpAuthorizationServer()],
      scopes_supported: MCP_SUPPORTED_SCOPES,
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
