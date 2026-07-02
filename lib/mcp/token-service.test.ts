import { createHash } from "node:crypto";

import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AppDatabase } from "@/lib/db/database";
import { createTestDatabase } from "@/lib/db/testing";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";
import { OAuthAuthorizationCodeUsedError, OAuthTokenService } from "@/lib/mcp/token-service";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("OAuth token service", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let signingJwk: string;
  let publicJwk: Record<string, unknown>;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    const keyPair = await generateKeyPair("ES256", { extractable: true });
    const privateJwk = await exportJWK(keyPair.privateKey);
    publicJwk = { ...(await exportJWK(keyPair.publicKey)), kid: "mcp-token-test", alg: "ES256" };
    signingJwk = JSON.stringify({ ...privateJwk, kid: "mcp-token-test", alg: "ES256" });
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("exchanges a PKCE-bound authorization code for a workspace-bound access token", async () => {
    const client = await new OAuthClientRegistrationService(database).register({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "wallets:read analytics:read",
    });
    const service = new OAuthTokenService(database, {
      issuer: "https://cfo.example.com",
      audience: "https://cfo.example.com/mcp",
      signingJwk,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });
    const verifier = "verifier-value-with-enough-entropy";
    const authorization = await service.createAuthorizationCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      privyUserId: "did:privy:user-1",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      scope: "wallets:read analytics:read",
    });

    const token = await service.exchangeAuthorizationCode({
      grant_type: "authorization_code",
      code: authorization.code,
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      client_id: client.client_id,
      code_verifier: verifier,
    });

    expect(token).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      scope: "wallets:read analytics:read",
    });
    const verified = await jwtVerify(token.access_token, createLocalJWKSet({ keys: [publicJwk] }), {
      issuer: "https://cfo.example.com",
      audience: "https://cfo.example.com/mcp",
      currentDate: new Date("2026-07-02T00:00:00.000Z"),
    });
    expect(verified.payload).toMatchObject({
      scope: "wallets:read analytics:read",
      privy_user_id: "did:privy:user-1",
      workspace_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(verified.payload.exp).toBe(1_782_951_300);
  });

  it("rejects authorization code replay", async () => {
    const client = await new OAuthClientRegistrationService(database).register({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
    });
    const service = new OAuthTokenService(database, {
      issuer: "https://cfo.example.com",
      audience: "https://cfo.example.com/mcp",
      signingJwk,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });
    const verifier = "another-verifier-value-with-enough-entropy";
    const authorization = await service.createAuthorizationCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      privyUserId: "did:privy:user-1",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      scope: "wallets:read",
    });
    const request = {
      grant_type: "authorization_code" as const,
      code: authorization.code,
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      client_id: client.client_id,
      code_verifier: verifier,
    };

    await service.exchangeAuthorizationCode(request);

    await expect(service.exchangeAuthorizationCode(request)).rejects.toBeInstanceOf(
      OAuthAuthorizationCodeUsedError,
    );
  });

  it("rejects a mismatched PKCE verifier", async () => {
    const client = await new OAuthClientRegistrationService(database).register({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
    });
    const service = new OAuthTokenService(database, {
      issuer: "https://cfo.example.com",
      audience: "https://cfo.example.com/mcp",
      signingJwk,
      now: () => new Date("2026-07-02T00:00:00.000Z"),
    });
    const authorization = await service.createAuthorizationCode({
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:6274/oauth/callback",
      codeChallenge: pkceChallenge("expected-verifier-value-with-enough-entropy"),
      codeChallengeMethod: "S256",
      privyUserId: "did:privy:user-1",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      scope: "wallets:read",
    });

    await expect(
      service.exchangeAuthorizationCode({
        grant_type: "authorization_code",
        code: authorization.code,
        redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        client_id: client.client_id,
        code_verifier: "wrong-verifier-value-with-enough-entropy",
      }),
    ).rejects.toThrow("PKCE verifier does not match authorization code");
  });
});
