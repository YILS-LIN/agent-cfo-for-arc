import { describe, expect, it } from "vitest";

import { buildPublicJwksFromSigningJwk } from "@/lib/mcp/jwks";

describe("MCP OAuth JWKS", () => {
  it("publishes public key material without leaking private JWK fields", async () => {
    const jwks = await buildPublicJwksFromSigningJwk(
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

    expect(jwks).toEqual({
      keys: [
        {
          kty: "EC",
          kid: "mcp-signing-1",
          alg: "ES256",
          use: "sig",
          crv: "P-256",
          x: "f83OJ3D2xF4d2Rdsu8OePLXw89dV6tRMh0Lw2E4kz4M",
          y: "x_FEzRu9dU8F7m1WmQqdkZ9P9RjU0U5e7GgF2Gtf2w8",
        },
      ],
    });
    expect(JSON.stringify(jwks)).not.toContain("NFDunr0D");
  });

  it("rejects symmetric signing keys", async () => {
    await expect(
      buildPublicJwksFromSigningJwk(
        JSON.stringify({
          kty: "oct",
          kid: "shared-secret",
          alg: "HS256",
          k: "secret",
        }),
      ),
    ).rejects.toThrow("MCP OAuth signing JWK must be an RSA or P-256 private key");
  });
});
