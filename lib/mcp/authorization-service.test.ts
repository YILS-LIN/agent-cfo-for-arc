import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { createTestDatabase } from "@/lib/db/testing";
import { OAuthAuthorizationService } from "@/lib/mcp/authorization-service";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";
import { OAuthInvalidGrantError, OAuthTokenService } from "@/lib/mcp/token-service";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("OAuth authorization service", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let context: AuthContext;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    context = {
      userId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      role: "owner",
      identities: [{ type: "google", subject: "did:privy:user-1" }],
    };
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("creates a PKCE-bound authorization code and redirects back to the client", async () => {
    const client = await new OAuthClientRegistrationService(database).register({
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "wallets:read analytics:read",
    });
    const service = new OAuthAuthorizationService(
      database,
      new OAuthTokenService(database, {
        issuer: "https://cfo.example.com",
        audience: "https://cfo.example.com/mcp",
        signingJwk: "{}",
        now: () => new Date("2026-07-02T00:00:00.000Z"),
      }),
    );

    const result = await service.authorize(context, {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1:6274/oauth/callback",
      scope: "wallets:read",
      state: "client-state",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
    });

    expect(result.redirectTo.origin).toBe("http://127.0.0.1:6274");
    expect(result.redirectTo.pathname).toBe("/oauth/callback");
    expect(result.redirectTo.searchParams.get("code")).toMatch(/^mcp_code_/);
    expect(result.redirectTo.searchParams.get("state")).toBe("client-state");
    expect(result.scope).toBe("wallets:read");
    expect(result.workspaceId).toBe(context.workspaceId);
  });

  it("rejects requested scopes outside the registered client grant", async () => {
    const client = await new OAuthClientRegistrationService(database).register({
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      scope: "wallets:read",
    });
    const service = new OAuthAuthorizationService(
      database,
      new OAuthTokenService(database, {
        issuer: "https://cfo.example.com",
        audience: "https://cfo.example.com/mcp",
        signingJwk: "{}",
      }),
    );

    await expect(
      service.authorize(context, {
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        scope: "wallets:write",
        code_challenge: "x".repeat(43),
        code_challenge_method: "S256",
      }),
    ).rejects.toBeInstanceOf(OAuthInvalidGrantError);
  });
});
