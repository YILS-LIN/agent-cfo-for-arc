import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
} from "@/lib/mcp/metadata";

describe("MCP protected resource metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes the MCP resource, authorization server, and granular scopes", () => {
    vi.stubEnv("MCP_PUBLIC_URL", "https://cfo.example.com");
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://auth.example.com");

    expect(buildMcpProtectedResourceMetadata()).toEqual({
      resource: "https://cfo.example.com/mcp",
      resource_name: "Agent CFO for Arc MCP",
      authorization_servers: ["https://auth.example.com"],
      bearer_methods_supported: ["header"],
      scopes_supported: [
        "wallets:read",
        "wallets:write",
        "analytics:read",
        "budgets:read",
        "budgets:write",
        "reports:read",
      ],
    });
  });

  it("publishes OAuth authorization server discovery metadata", () => {
    vi.stubEnv("MCP_OAUTH_ISSUER", "https://cfo.example.com");
    vi.stubEnv("MCP_OAUTH_JWKS_URL", "https://cfo.example.com/oauth/jwks");

    expect(buildMcpAuthorizationServerMetadata()).toEqual({
      issuer: "https://cfo.example.com",
      authorization_endpoint: "https://cfo.example.com/oauth/authorize",
      token_endpoint: "https://cfo.example.com/oauth/token",
      jwks_uri: "https://cfo.example.com/oauth/jwks",
      registration_endpoint: "https://cfo.example.com/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [
        "wallets:read",
        "wallets:write",
        "analytics:read",
        "budgets:read",
        "budgets:write",
        "reports:read",
      ],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});
