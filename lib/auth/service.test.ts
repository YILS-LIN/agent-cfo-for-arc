import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthService } from "@/lib/auth/service";
import {
  IdentityConflictError,
  WorkspaceAccessDeniedError,
  type AuthProvider,
  type ExternalSession,
} from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { identityAccounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

class FakeAuthProvider implements AuthProvider {
  constructor(public session: ExternalSession | null) {}
  async verifyWebSession() {
    return this.session;
  }
}

function session(subject = "did:privy:user-1"): ExternalSession {
  return {
    providerUserId: subject,
    sessionId: "session-1",
    identities: [
      { provider: "privy_user", subject },
      {
        provider: "privy_google",
        subject: `${subject}-google`,
        email: `${subject.replaceAll(":", "-")}@example.com`,
        name: "Test User",
      },
    ],
  };
}

describe("AuthService", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("creates one internal user and personal workspace, then reuses them", async () => {
    const provider = new FakeAuthProvider(session());
    const service = new AuthService(database, provider);
    const first = await service.resolve(new Request("https://example.com"));
    const replay = await service.resolve(new Request("https://example.com"));

    expect(first).toMatchObject({ role: "owner", identities: [{ type: "google" }] });
    expect(replay.userId).toBe(first.userId);
    expect(replay.workspaceId).toBe(first.workspaceId);
    await expect(database.select().from(users)).resolves.toHaveLength(1);
    await expect(database.select().from(workspaces)).resolves.toHaveLength(1);
    await expect(database.select().from(identityAccounts)).resolves.toHaveLength(2);
  });

  it("does not create orphan users during concurrent first-session provisioning", async () => {
    const service = new AuthService(database, new FakeAuthProvider(session("did:privy:race")));
    const [first, second] = await Promise.all([
      service.resolve(new Request("https://example.com")),
      service.resolve(new Request("https://example.com")),
    ]);

    expect(second.userId).toBe(first.userId);
    expect(second.workspaceId).toBe(first.workspaceId);
    await expect(database.select().from(users)).resolves.toHaveLength(1);
    await expect(database.select().from(workspaces)).resolves.toHaveLength(1);
  });

  it("derives workspace from a verified membership cookie and enforces roles", async () => {
    const provider = new FakeAuthProvider(session());
    const service = new AuthService(database, provider);
    const owner = await service.resolve(new Request("https://example.com"));
    const viewerWorkspaceId = randomUUID();
    await database.insert(workspaces).values({
      id: viewerWorkspaceId,
      ownerId: owner.userId,
      name: "Read-only workspace",
    });
    await database
      .insert(workspaceMembers)
      .values({ workspaceId: viewerWorkspaceId, userId: owner.userId, role: "viewer" });

    const request = new Request("https://example.com", {
      headers: { cookie: `agent-cfo-workspace=${viewerWorkspaceId}` },
    });
    await expect(service.resolve(request)).resolves.toMatchObject({
      workspaceId: viewerWorkspaceId,
      role: "viewer",
    });
    await expect(service.requireRole(request, ["owner", "operator"])).rejects.toBeInstanceOf(
      WorkspaceAccessDeniedError,
    );
  });

  it("rejects a workspace cookie without membership", async () => {
    const service = new AuthService(database, new FakeAuthProvider(session()));
    await expect(
      service.resolve(
        new Request("https://example.com", {
          headers: { cookie: `agent-cfo-workspace=${randomUUID()}` },
        }),
      ),
    ).rejects.toBeInstanceOf(WorkspaceAccessDeniedError);
  });

  it("rejects linked identities already mapped to different internal users", async () => {
    const provider = new FakeAuthProvider(session("did:privy:first"));
    const service = new AuthService(database, provider);
    await service.resolve(new Request("https://example.com"));
    provider.session = session("did:privy:second");
    await service.resolve(new Request("https://example.com"));
    provider.session = {
      providerUserId: "did:privy:merged",
      sessionId: "session-merged",
      identities: [
        { provider: "privy_user", subject: "did:privy:first" },
        { provider: "privy_google", subject: "did:privy:second-google" },
      ],
    };

    await expect(service.resolve(new Request("https://example.com"))).rejects.toBeInstanceOf(
      IdentityConflictError,
    );
  });

  it("removes unlinked identities before they can be assigned to another Privy user", async () => {
    const provider = new FakeAuthProvider(session("did:privy:original"));
    const service = new AuthService(database, provider);
    const original = await service.resolve(new Request("https://example.com"));

    provider.session = {
      providerUserId: "did:privy:original",
      sessionId: "session-unlinked",
      identities: [{ provider: "privy_user", subject: "did:privy:original" }],
    };
    await service.resolve(new Request("https://example.com"));
    await expect(database.select().from(identityAccounts)).resolves.toMatchObject([
      { provider: "privy_user", providerSubject: "did:privy:original" },
    ]);

    provider.session = {
      providerUserId: "did:privy:new-user",
      sessionId: "session-relinked",
      identities: [
        { provider: "privy_user", subject: "did:privy:new-user" },
        {
          provider: "privy_google",
          subject: "did:privy:original-google",
          email: "relinked@example.com",
        },
      ],
    };
    const relinked = await service.resolve(new Request("https://example.com"));

    expect(relinked.userId).not.toBe(original.userId);
    await expect(database.select().from(users)).resolves.toHaveLength(2);
  });
});
