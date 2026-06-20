import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ApplicationPermissionError,
  IdempotencyKeyRequiredError,
  IdempotencyRequestUnresolvedError,
  WorkspaceApplicationService,
} from "@/lib/application/workspace-service";
import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import {
  IdempotencyConflictError,
  OptimisticLockError,
  WorkspaceRepository,
} from "@/lib/db/repositories";
import { auditEvents, budgets, idempotencyKeys, wallets } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

const capabilities = {
  observable: true,
  ownershipVerified: false,
  userSignable: false,
  agentExecutable: false,
  policyEnforceable: false,
};

describe("WorkspaceApplicationService", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let service: WorkspaceApplicationService;
  let owner: AuthContext;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    service = new WorkspaceApplicationService(database);
    const scope = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "Alice",
      email: "alice@example.com",
    });
    owner = { ...scope, role: "owner", identities: [] };
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  function walletInput(address = "0x1111111111111111111111111111111111111111") {
    return {
      address,
      chainId: 5_042_002,
      source: "manual" as const,
      label: "Operations",
      capabilities,
    };
  }

  function budgetInput() {
    return {
      periodType: "daily" as const,
      periodStart: new Date("2026-06-20T00:00:00.000Z"),
      periodEnd: new Date("2026-06-21T00:00:00.000Z"),
      amount: "10.5",
      warningThreshold: 80,
    };
  }

  it("allows workspace writers, audits mutations, and replays wallet creation", async () => {
    const first = await service.createWallet(owner, walletInput(), " wallet-request-1 ");
    const replay = await service.createWallet(owner, walletInput(), "wallet-request-1");

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, wallet: { id: first.wallet.id } });
    await expect(database.select().from(wallets)).resolves.toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toMatchObject([
      {
        action: "wallet.created",
        actorUserId: owner.userId,
        idempotencyKey: "wallet-request-1",
      },
    ]);
    await expect(database.select().from(idempotencyKeys)).resolves.toMatchObject([
      { status: "completed", response: { walletId: first.wallet.id } },
    ]);
  });

  it("rejects viewers and invalid idempotency keys before writing", async () => {
    const viewer: AuthContext = { ...owner, role: "viewer" };

    await expect(service.createWallet(viewer, walletInput(), "request-1")).rejects.toBeInstanceOf(
      ApplicationPermissionError,
    );
    await expect(service.createWallet(owner, walletInput(), " ")).rejects.toBeInstanceOf(
      IdempotencyKeyRequiredError,
    );
    await expect(database.select().from(wallets)).resolves.toHaveLength(0);
  });

  it("rejects reuse of an idempotency key with a different request", async () => {
    await service.createWallet(owner, walletInput(), "request-1");

    await expect(
      service.createWallet(
        owner,
        walletInput("0x2222222222222222222222222222222222222222"),
        "request-1",
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("atomically switches the primary wallet and records the actor", async () => {
    const first = await service.createWallet(owner, walletInput(), "wallet-1");
    const second = await service.createWallet(
      owner,
      walletInput("0x2222222222222222222222222222222222222222"),
      "wallet-2",
    );

    const primary = await service.setPrimaryWallet(owner, second.wallet.id);
    const records = await service.listWallets(owner);

    expect(primary.isPrimary).toBe(true);
    expect(records.find((wallet) => wallet.id === first.wallet.id)?.isPrimary).toBe(false);
    expect(records.filter((wallet) => wallet.isPrimary)).toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(3);
  });

  it("creates and replays budgets, then updates with optimistic locking", async () => {
    const first = await service.createBudget(
      owner,
      { ...budgetInput(), createdBy: randomUUID() },
      "budget-request-1",
    );
    const replay = await service.createBudget(owner, budgetInput(), "budget-request-1");
    const updated = await service.updateBudgetAmount(owner, {
      budgetId: first.budget.id,
      expectedVersion: 1,
      amount: "12.000001",
    });

    expect(replay).toMatchObject({ replayed: true, budget: { id: first.budget.id } });
    expect(first.budget.createdBy).toBe(owner.userId);
    expect(updated).toMatchObject({ amount: "12.000001", version: 2 });
    await expect(
      service.updateBudgetAmount(owner, {
        budgetId: first.budget.id,
        expectedVersion: 1,
        amount: "13",
      }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(database.select().from(budgets)).resolves.toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(2);
  });

  it("marks failed idempotent mutations without creating an audit record", async () => {
    await expect(
      service.createWallet(owner, walletInput("invalid-address"), "invalid-wallet"),
    ).rejects.toThrow();

    await expect(database.select().from(wallets)).resolves.toHaveLength(0);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(0);
    await expect(database.select().from(idempotencyKeys)).resolves.toMatchObject([
      { status: "failed", response: { errorCode: "ZodError" } },
    ]);
    await expect(
      service.createWallet(owner, walletInput("invalid-address"), "invalid-wallet"),
    ).rejects.toBeInstanceOf(IdempotencyRequestUnresolvedError);
  });
});
