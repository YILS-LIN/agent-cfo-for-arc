import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/oauth/token/route";

const service = {
  exchangeAuthorizationCode: vi.fn(),
};

vi.mock("@/lib/mcp/server", () => ({
  getOAuthTokenService: () => service,
}));

describe("POST /oauth/token", () => {
  beforeEach(() => {
    service.exchangeAuthorizationCode.mockReset();
  });

  it("exchanges an authorization code from a form-urlencoded token request", async () => {
    service.exchangeAuthorizationCode.mockResolvedValue({
      access_token: "signed.jwt",
      token_type: "Bearer",
      expires_in: 900,
      scope: "wallets:read",
    });

    const response = await POST(
      new Request("https://cfo.example.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "mcp_code_123",
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
          client_id: "mcp_client_123",
          code_verifier: "verifier-value-with-enough-entropy",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      access_token: "signed.jwt",
      token_type: "Bearer",
      expires_in: 900,
      scope: "wallets:read",
    });
    expect(service.exchangeAuthorizationCode).toHaveBeenCalledWith({
      grant_type: "authorization_code",
      code: "mcp_code_123",
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      client_id: "mcp_client_123",
      code_verifier: "verifier-value-with-enough-entropy",
    });
  });
});
