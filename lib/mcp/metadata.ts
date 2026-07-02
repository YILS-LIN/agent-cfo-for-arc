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
export function buildMcpAuthorizationServerMetadata() {
  const issuer = mcpAuthorizationServer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: process.env.MCP_OAUTH_JWKS_URL ?? `${issuer}/oauth/jwks`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_SUPPORTED_SCOPES],
    token_endpoint_auth_methods_supported: ["none"],
  };
}
