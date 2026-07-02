import "server-only";

import { MCP_SUPPORTED_SCOPES, mcpAuthorizationServer, mcpPublicUrl } from "@/lib/mcp/oauth";

export function buildMcpProtectedResourceMetadata() {
  return {
    resource: `${mcpPublicUrl()}/mcp`,
    resource_name: "Agent CFO for Arc MCP",
    authorization_servers: [mcpAuthorizationServer()],
    bearer_methods_supported: ["header"],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
  };
}
