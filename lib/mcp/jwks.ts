import "server-only";

import { z } from "zod";

export class McpOAuthSigningKeyNotConfiguredError extends Error {}

type PublicJwk = {
  kty: "RSA" | "EC";
  kid: string;
  alg: "RS256" | "ES256";
  use: "sig";
  n?: string;
  e?: string;
  crv?: "P-256";
  x?: string;
  y?: string;
};

const rsaPrivateJwkSchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1),
  alg: z.literal("RS256"),
  n: z.string().min(1),
  e: z.string().min(1),
  d: z.string().min(1),
});

const ecPrivateJwkSchema = z.object({
  kty: z.literal("EC"),
  kid: z.string().min(1),
  alg: z.literal("ES256"),
  crv: z.literal("P-256"),
  x: z.string().min(1),
  y: z.string().min(1),
  d: z.string().min(1),
});

const signingJwkSchema = z.union([rsaPrivateJwkSchema, ecPrivateJwkSchema]);

export type PublicJwks = { keys: PublicJwk[] };

export async function buildPublicJwksFromSigningJwk(
  value: string | undefined,
): Promise<PublicJwks> {
  if (!value) {
    throw new McpOAuthSigningKeyNotConfiguredError("MCP_OAUTH_SIGNING_JWK is required");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new McpOAuthSigningKeyNotConfiguredError("MCP_OAUTH_SIGNING_JWK must be valid JSON");
  }

  const result = signingJwkSchema.safeParse(parsed);
  if (!result.success) {
    throw new McpOAuthSigningKeyNotConfiguredError(
      "MCP OAuth signing JWK must be an RSA or P-256 private key",
    );
  }

  const jwk = result.data;
  if (jwk.kty === "RSA") {
    return {
      keys: [{ kty: jwk.kty, kid: jwk.kid, alg: jwk.alg, use: "sig", n: jwk.n, e: jwk.e }],
    };
  }
  return {
    keys: [
      {
        kty: jwk.kty,
        kid: jwk.kid,
        alg: jwk.alg,
        use: "sig",
        crv: jwk.crv,
        x: jwk.x,
        y: jwk.y,
      },
    ],
  };
}

export function buildPublicJwksFromEnvironment() {
  return buildPublicJwksFromSigningJwk(process.env.MCP_OAUTH_SIGNING_JWK);
}
