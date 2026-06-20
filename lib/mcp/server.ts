import "server-only";

import { getDatabase } from "@/lib/db/client";
import { createMcpTokenVerifierFromEnvironment, McpOAuthService } from "@/lib/mcp/oauth";

let oauthService: McpOAuthService | undefined;

export function getMcpOAuthService() {
  oauthService ??= new McpOAuthService(
    getDatabase(),
    createMcpTokenVerifierFromEnvironment(),
    process.env.MCP_OAUTH_PRIVY_SUBJECT_CLAIM ?? "privy_user_id",
    process.env.MCP_OAUTH_WORKSPACE_CLAIM ?? "workspace_id",
  );
  return oauthService;
}
