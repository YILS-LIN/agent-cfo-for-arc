import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/oauth/register/route";

const service = {
  register: vi.fn(),
};

vi.mock("@/lib/mcp/server", () => ({
  getOAuthClientRegistrationService: () => service,
}));

describe("POST /oauth/register", () => {
  beforeEach(() => {
    service.register.mockReset();
  });

  it("registers a dynamic public OAuth client", async () => {
    service.register.mockResolvedValue({
      client_id: "mcp_client_123",
      client_id_issued_at: 1_781_000_000,
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "wallets:read",
    });

    const response = await POST(
      new Request("https://cfo.example.com/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Arc Desktop",
          redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
          scope: "wallets:read",
        }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      client_id: "mcp_client_123",
      client_id_issued_at: 1_781_000_000,
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "wallets:read",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(service.register).toHaveBeenCalledWith({
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "wallets:read",
    });
  });
});
