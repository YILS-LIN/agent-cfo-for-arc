import { afterEach, describe, expect, it, vi } from "vitest";

import { buildMcpProtectedResourceMetadata } from "@/lib/mcp/metadata";

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
});
