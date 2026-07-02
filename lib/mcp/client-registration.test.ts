import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AppDatabase } from "@/lib/db/database";
import { createTestDatabase } from "@/lib/db/testing";
import { OAuthClientRegistrationService } from "@/lib/mcp/client-registration";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("OAuth dynamic client registration", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("registers a public authorization-code client and persists redirect URIs", async () => {
    const service = new OAuthClientRegistrationService(database);

    const registered = await service.register({
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "wallets:read analytics:read",
    });

    expect(registered).toMatchObject({
      client_name: "Arc Desktop",
      redirect_uris: ["http://127.0.0.1:6274/oauth/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "wallets:read analytics:read",
    });
    expect(registered.client_id).toMatch(/^mcp_client_[A-Za-z0-9_-]+$/);
    expect(registered.client_id_issued_at).toBeGreaterThan(0);

    await expect(service.getByClientId(registered.client_id)).resolves.toMatchObject({
      clientId: registered.client_id,
      clientName: "Arc Desktop",
      redirectUris: ["http://127.0.0.1:6274/oauth/callback"],
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
      scope: "wallets:read analytics:read",
    });
  });

  it("rejects unsupported redirect URI schemes", async () => {
    const service = new OAuthClientRegistrationService(database);

    await expect(
      service.register({
        redirect_uris: ["ftp://client.example.com/callback"],
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ message: "Redirect URI must use http or https" }),
      ]),
    });
  });

  it("only allows plain http redirects for loopback clients", async () => {
    const service = new OAuthClientRegistrationService(database);

    await expect(
      service.register({
        redirect_uris: ["http://client.example.com/callback"],
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ message: "HTTP redirect URI must use loopback host" }),
      ]),
    });
  });
});
