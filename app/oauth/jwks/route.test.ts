import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/oauth/jwks/route";

describe("GET /oauth/jwks", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes the configured MCP OAuth public signing keys", async () => {
    vi.stubEnv(
      "MCP_OAUTH_SIGNING_JWK",
      JSON.stringify({
        kty: "EC",
        kid: "mcp-signing-1",
        alg: "ES256",
        crv: "P-256",
        x: "f83OJ3D2xF4d2Rdsu8OePLXw89dV6tRMh0Lw2E4kz4M",
        y: "x_FEzRu9dU8F7m1WmQqdkZ9P9RjU0U5e7GgF2Gtf2w8",
        d: "NFDunr0DrmrOQiS2ZyykEoZgX1WQjR6VMm7dS3ZiF7o",
      }),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    await expect(response.json()).resolves.toEqual({
      keys: [
        expect.objectContaining({
          kty: "EC",
          kid: "mcp-signing-1",
          alg: "ES256",
          use: "sig",
        }),
      ],
    });
  });

  it("returns a service error when the signing key is not configured", async () => {
    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "MCP_OAUTH_SIGNING_KEY_NOT_CONFIGURED",
    });
  });
});
