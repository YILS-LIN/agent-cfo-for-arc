import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceRepository } from "@/lib/db/repositories";
import { identityAccounts, workspaceMembers } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import {
  McpAuthenticationRequiredError,
  McpAuthorizationError,
  McpOAuthService,
} from "@/lib/mcp/oauth";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("McpOAuthService", () => {
  let testDatabase: TestDatabase;
  let userId: string;
  let workspaceId: string;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    const scope = await new WorkspaceRepository(testDatabase.database).createPersonalWorkspace({
      displayName: "Alice",
      email: `${randomUUID()}@example.com`,
    });
    userId = scope.userId;
    workspaceId = scope.workspaceId;
    await testDatabase.database.insert(identityAccounts).values({
      id: randomUUID(),
      userId,
      provider: "privy_user",
      providerSubject: "did:privy:alice",
    });
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  function request(token = "valid") {
    return new Request("https://cfo.example.com/mcp", {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  it("derives the internal user, workspace membership, and role from persistence", async () => {
    const service = new McpOAuthService(testDatabase.database, async () => ({
      payload: {
        privy_user_id: "did:privy:alice",
        workspace_id: workspaceId,
        scope: "agent-cfo:read agent-cfo:write",
        role: "owner",
      },
    }));

    await expect(service.resolve(request())).resolves.toMatchObject({
      userId,
      workspaceId,
      role: "owner",
    });
  });

  it("rejects missing scopes and unverified workspace membership", async () => {
    const missingScope = new McpOAuthService(testDatabase.database, async () => ({
      payload: { privy_user_id: "did:privy:alice", workspace_id: workspaceId, scope: "openid" },
    }));
    const wrongWorkspace = new McpOAuthService(testDatabase.database, async () => ({
      payload: {
        privy_user_id: "did:privy:alice",
        workspace_id: randomUUID(),
        scope: "agent-cfo:read",
      },
    }));

    await expect(missingScope.resolve(request())).rejects.toBeInstanceOf(McpAuthorizationError);
    await expect(wrongWorkspace.resolve(request())).rejects.toBeInstanceOf(McpAuthorizationError);
  });

  it("requires an explicit workspace claim when a user has multiple memberships", async () => {
    const second = await new WorkspaceRepository(testDatabase.database).createPersonalWorkspace({
      displayName: "Bob",
      email: `${randomUUID()}@example.com`,
    });
    await testDatabase.database.insert(workspaceMembers).values({
      workspaceId: second.workspaceId,
      userId,
      role: "viewer",
    });
    const service = new McpOAuthService(testDatabase.database, async () => ({
      payload: { privy_user_id: "did:privy:alice", scope: "agent-cfo:read" },
    }));

    await expect(service.resolve(request())).rejects.toBeInstanceOf(McpAuthorizationError);
  });

  it("does not expose token verification failures", async () => {
    const service = new McpOAuthService(testDatabase.database, async () => {
      throw new Error("signature details");
    });
    await expect(service.resolve(request("bad"))).rejects.toMatchObject({
      message: "OAuth bearer token is invalid or expired",
    } satisfies Partial<McpAuthenticationRequiredError>);
  });
});
