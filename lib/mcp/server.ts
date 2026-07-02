import "server-only";

import { getDatabase } from "@/lib/db/client";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";
import { createMcpTokenVerifierFromEnvironment, McpOAuthService } from "@/lib/mcp/oauth";
import { OAuthTokenService } from "@/lib/mcp/token-service";

let oauthService: McpOAuthService | undefined;
let clientRegistrationService: OAuthClientRegistrationService | undefined;
let tokenService: OAuthTokenService | undefined;

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

export function getOAuthTokenService() {
  tokenService ??= new OAuthTokenService(getDatabase(), {
    issuer: process.env.MCP_OAUTH_ISSUER ?? "",
    audience: process.env.MCP_OAUTH_AUDIENCE ?? "",
    signingJwk: process.env.MCP_OAUTH_SIGNING_JWK ?? "",
  });
  return tokenService;
}
