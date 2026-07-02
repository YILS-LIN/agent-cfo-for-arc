import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/oauth/authorize/route";

const authService = {
  resolve: vi.fn(),
};
const authorizationService = {
  authorize: vi.fn(),
};

vi.mock("@/lib/auth/server", () => ({
  getAuthService: () => authService,
}));

vi.mock("@/lib/mcp/server", () => ({
  getOAuthAuthorizationService: () => authorizationService,
}));

describe("POST /oauth/authorize", () => {
  beforeEach(() => {
    authService.resolve.mockReset();
    authorizationService.authorize.mockReset();
  });

  it("creates an authorization code for the logged-in user and redirects to the client", async () => {
    const context = {
      userId: "user-1",
      workspaceId: "workspace-1",
      role: "owner",
      identities: [{ type: "google", subject: "did:privy:user-1" }],
    };
    authService.resolve.mockResolvedValue(context);
    authorizationService.authorize.mockResolvedValue({
      redirectTo: new URL("http://127.0.0.1:6274/oauth/callback?code=mcp_code_123&state=abc"),
      scope: "wallets:read",
      workspaceId: "workspace-1",
    });

    const response = await POST(
      new Request("https://cfo.example.com/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          response_type: "code",
          client_id: "mcp_client_123",
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          scope: "wallets:read",
          state: "abc",
          code_challenge: "x".repeat(43),
          code_challenge_method: "S256",
        }),
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://127.0.0.1:6274/oauth/callback?code=mcp_code_123&state=abc",
    );
    expect(authorizationService.authorize).toHaveBeenCalledWith(context, {
      response_type: "code",
      client_id: "mcp_client_123",
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      scope: "wallets:read",
      state: "abc",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
    });
  });
});

describe("GET /oauth/authorize", () => {
  beforeEach(() => {
    authService.resolve.mockReset();
    authorizationService.authorize.mockReset();
  });

  it("renders a no-store authorization confirmation page for the logged-in user", async () => {
    authService.resolve.mockResolvedValue({
      userId: "user-1",
      workspaceId: "workspace-1",
      role: "owner",
      identities: [{ type: "google", subject: "did:privy:user-1" }],
    });

    const response = await GET(
      new Request(
        "https://cfo.example.com/oauth/authorize?response_type=code&client_id=mcp_client_123&redirect_uri=http%3A%2F%2F127.0.0.1%3A6274%2Foauth%2Fcallback&scope=wallets%3Aread&state=abc&code_challenge=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&code_challenge_method=S256",
      ),
    );

    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Authorize MCP access");
    expect(html).toContain("workspace-1");
    expect(html).toContain("wallets:read");
    expect(html).toContain('name="code_challenge_method" value="S256"');
  });
});
