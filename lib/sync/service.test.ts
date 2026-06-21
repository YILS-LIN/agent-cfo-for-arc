import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { SyncLeaseUnavailableError, WorkspaceRepository } from "@/lib/db/repositories";
import { auditEvents, paymentEvents, syncCursors } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { WorkspaceSyncService } from "@/lib/sync/service";
import {
  PublicCircleEvidenceSyncAdapter,
  SyncSourceUnavailableError,
} from "@/lib/sync/circle-public-adapter";
import type { PaymentSyncAdapter } from "@/lib/sync/types";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

const capabilities = {
  observable: true,
  ownershipVerified: false,
  userSignable: false,
  agentExecutable: false,
  policyEnforceable: false,
};

describe("WorkspaceSyncService", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let application: WorkspaceApplicationService;
  let owner: AuthContext;
  let walletId: string;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    application = new WorkspaceApplicationService(database);
    const scope = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "Sync User",
      email: "sync@example.com",
    });
    owner = { ...scope, role: "owner", identities: [] };
    const wallet = await application.createWallet(
      owner,
      {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 5_042_002,
        source: "manual",
        label: "Sync wallet",
        capabilities,
      },
      "sync-wallet",
    );
    walletId = wallet.wallet.id;
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("persists adapter events idempotently and separates system from user audit actors", async () => {
    const adapter: PaymentSyncAdapter = {
      source: "x402",
      async sync() {
        return {
          cursor: "cursor-1",
          payments: [
            {
              walletId,
              externalId: "sync-payment-1",
              amount: "0.01",
              occurredAt: new Date("2026-06-20T00:00:00.000Z"),
              source: "x402",
            },
          ],
        };
      },
    };
    const service = new WorkspaceSyncService(database, application, [adapter]);

    await expect(service.sync(owner, { walletId, source: "x402" })).resolves.toMatchObject({
      created: 1,
      replayed: 0,
      cursor: { status: "ready", cursor: "cursor-1" },
    });
    await expect(service.sync(owner, { walletId, source: "x402" })).resolves.toMatchObject({
      created: 0,
      replayed: 1,
    });
    await expect(database.select().from(paymentEvents)).resolves.toHaveLength(1);
    await expect(database.select().from(syncCursors)).resolves.toMatchObject([
      { status: "ready", leaseToken: null, cursor: "cursor-1" },
    ]);
    const audits = await database.select().from(auditEvents);
    expect(audits.find((event) => event.action === "payment.ingested")?.actorUserId).toBeNull();
    expect(audits.filter((event) => event.action === "wallet.sync_completed")).toHaveLength(2);
    expect(audits.find((event) => event.action === "wallet.sync_completed")?.actorUserId).toBe(
      owner.userId,
    );
  });

  it("rejects a concurrent run while a live lease is held", async () => {
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter: PaymentSyncAdapter = {
      source: "arc",
      async sync() {
        markStarted?.();
        await blocked;
        return { payments: [], cursor: "done" };
      },
    };
    const service = new WorkspaceSyncService(database, application, [adapter]);
    const first = service.sync(owner, { walletId, source: "arc" });
    await started;

    await expect(service.sync(owner, { walletId, source: "arc" })).rejects.toBeInstanceOf(
      SyncLeaseUnavailableError,
    );
    release?.();
    await expect(first).resolves.toMatchObject({ cursor: { status: "ready" } });
  });

  it("releases a failed lease and recovers on the next sync", async () => {
    let attempts = 0;
    const adapter: PaymentSyncAdapter = {
      source: "arc",
      async sync() {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary upstream failure");
        return { payments: [], cursor: "recovered" };
      },
    };
    const service = new WorkspaceSyncService(database, application, [adapter]);

    await expect(service.sync(owner, { walletId, source: "arc" })).rejects.toThrow(
      "temporary upstream failure",
    );
    await expect(service.list(owner)).resolves.toMatchObject([
      { status: "failed", leaseToken: null, lastError: "temporary upstream failure" },
    ]);
    await expect(service.sync(owner, { walletId, source: "arc" })).resolves.toMatchObject({
      cursor: { status: "ready", cursor: "recovered", leaseToken: null, lastError: null },
    });
  });

  it("does not claim Circle discovery support for arbitrary wallets", async () => {
    await expect(
      new PublicCircleEvidenceSyncAdapter().sync({
        wallet: {
          id: walletId,
          address: "0x1111111111111111111111111111111111111111",
          normalizedAddress: "0x1111111111111111111111111111111111111111",
          chainId: 5_042_002,
        },
      }),
    ).rejects.toBeInstanceOf(SyncSourceUnavailableError);
  });
});
