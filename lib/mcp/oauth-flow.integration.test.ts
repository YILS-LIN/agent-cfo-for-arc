import { createHash } from "node:crypto";

import { createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { identityAccounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { OAuthAuthorizationService } from "@/lib/mcp/authorization-service";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";
import { McpOAuthService, createMcpTokenVerifier } from "@/lib/mcp/oauth";
import { OAuthTokenService } from "@/lib/mcp/token-service";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("MCP OAuth authorization-code flow", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("issues a workspace-bound access token that the MCP resource server accepts", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const workspaceId = "22222222-2222-4222-8222-222222222222";
    await database.insert(users).values({
      id: userId,
      displayName: "OAuth User",
      email: "oauth@example.com",
    });
    await database.insert(workspaces).values({
      id: workspaceId,
      name: "OAuth Workspace",
      ownerId: userId,
    });
    await database.insert(workspaceMembers).values({ userId, workspaceId, role: "owner" });
    await database.insert(identityAccounts).values({
      id: "33333333-3333-4333-8333-333333333333",
      userId,
      provider: "privy_user",
      providerSubject: "did:privy:user-1",
    });

    const keyPair = await generateKeyPair("ES256", { extractable: true });
    const privateJwk = await exportJWK(keyPair.privateKey);
    const publicJwk = await exportJWK(keyPair.publicKey);
    const signingJwk = JSON.stringify({ ...privateJwk, kid: "mcp-flow", alg: "ES256" });
    const tokenService = new OAuthTokenService(database, {
      issuer: "https://cfo.example.com",
      audience: "https://cfo.example.com/mcp",
      signingJwk,
    });
    const authorizationService = new OAuthAuthorizationService(database, tokenService);
    const client = await new OAuthClientRegistrationService(database).register({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "wallets:read analytics:read",
    });
    const verifier = "oauth-flow-verifier-value-with-enough-entropy";
    const context: AuthContext = {
      userId,
      workspaceId,
      role: "owner",
      identities: [{ type: "google", subject: "did:privy:user-1" }],
    };

    const authorization = await authorizationService.authorize(context, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      scope: "wallets:read analytics:read",
      state: "client-state",
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    const token = await tokenService.exchangeAuthorizationCode({
      grant_type: "authorization_code",
      code: authorization.redirectTo.searchParams.get("code"),
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      client_id: client.client_id,
      code_verifier: verifier,
    });
    const mcp = new McpOAuthService(
      database,
      createMcpTokenVerifier({
        issuer: "https://cfo.example.com",
        audience: "https://cfo.example.com/mcp",
        jwks: createLocalJWKSet({ keys: [{ ...publicJwk, kid: "mcp-flow", alg: "ES256" }] }),
      }),
    );

    await expect(
      mcp.resolve(
        new Request("https://cfo.example.com/mcp", {
          headers: { authorization: `Bearer ${token.access_token}` },
        }),
        ["wallets:read"],
      ),
    ).resolves.toMatchObject({
      userId,
      workspaceId,
      role: "owner",
      scopes: expect.any(Set),
    });
  });
});
