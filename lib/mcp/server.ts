import "server-only";

import { getDatabase } from "@/lib/db/client";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";
import { createMcpTokenVerifierFromEnvironment, McpOAuthService } from "@/lib/mcp/oauth";

let oauthService: McpOAuthService | undefined;
let clientRegistrationService: OAuthClientRegistrationService | undefined;

export function getMcpOAuthService() {
  oauthService ??= new McpOAuthService(
    getDatabase(),
    createMcpTokenVerifierFromEnvironment(),
    process.env.MCP_OAUTH_PRIVY_SUBJECT_CLAIM ?? "privy_user_id",
    process.env.MCP_OAUTH_WORKSPACE_CLAIM ?? "workspace_id",
  );
  return oauthService;
}

export function getOAuthClientRegistrationService() {
  clientRegistrationService ??= new OAuthClientRegistrationService(getDatabase());
  return clientRegistrationService;
}
