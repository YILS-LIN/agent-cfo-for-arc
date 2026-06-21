import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AiCredentialNotConfiguredError,
  AiCredentialPermissionError,
  AiCredentialService,
} from "@/lib/ai/credential-service";
import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { OptimisticLockError, WorkspaceRepository } from "@/lib/db/repositories";
import { aiProviderCredentials, auditEvents } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { SecretVault } from "@/lib/secrets/vault";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("AiCredentialService", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let owner: AuthContext;
  let service: AiCredentialService;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    const scope = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "AI Owner",
      email: "ai-owner@example.com",
    });
    owner = { ...scope, role: "owner", identities: [] };
    service = new AiCredentialService(database, new SecretVault(randomBytes(32), "test-v1"));
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("stores only encrypted secret material and returns safe metadata", async () => {
    const secret = "sk-project-secret-value-1234";
    const created = await service.store(owner, {
      provider: "openai",
      model: "gpt-5.5",
      secret,
      expectedVersion: 0,
    });
    const [record] = await database.select().from(aiProviderCredentials);
    const decrypted = await service.getDecrypted(owner, "openai");

    expect(created).toMatchObject({
      provider: "openai",
      model: "gpt-5.5",
      secretHint: "••••1234",
      status: "unverified",
      version: 1,
    });
    expect(created).not.toHaveProperty("encryptedSecret");
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(decrypted.secret).toBe(secret);
    expect(await service.list(owner)).toEqual([created]);
    expect(JSON.stringify(await database.select().from(auditEvents))).not.toContain(secret);
  });

  it("rotates and deletes credentials with optimistic versions", async () => {
    await service.store(owner, {
      provider: "openai",
      model: "gpt-5.5",
      secret: "sk-first-secret-value-1234",
      expectedVersion: 0,
    });
    const updated = await service.store(owner, {
      provider: "openai",
      model: "gpt-5.5",
      secret: "sk-second-secret-value-5678",
      expectedVersion: 1,
    });

    expect(updated).toMatchObject({ secretHint: "••••5678", version: 2 });
    await expect(
      service.delete(owner, { provider: "openai", expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(
      service.delete(owner, { provider: "openai", expectedVersion: 2 }),
    ).resolves.toEqual({ deleted: true });
    await expect(service.list(owner)).resolves.toEqual([]);
  });

  it("keeps viewers read-only", async () => {
    await expect(
      service.store(
        { ...owner, role: "viewer" },
        {
          provider: "openai",
          model: "gpt-5.5",
          secret: "sk-viewer-secret-value-1234",
          expectedVersion: 0,
        },
      ),
    ).rejects.toBeInstanceOf(AiCredentialPermissionError);
  });

  it("never exposes credentials across workspaces", async () => {
    await service.store(owner, {
      provider: "openai",
      model: "gpt-5.5",
      secret: "sk-owner-secret-value-1234",
      expectedVersion: 0,
    });
    const other = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "Other AI Owner",
      email: "other-ai-owner@example.com",
    });
    const otherContext: AuthContext = { ...other, role: "owner", identities: [] };

    await expect(service.list(otherContext)).resolves.toEqual([]);
    await expect(service.getDecrypted(otherContext, "openai")).rejects.toBeInstanceOf(
      AiCredentialNotConfiguredError,
    );
  });
});
