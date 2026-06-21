import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AppDatabase } from "@/lib/db/database";
import {
  AuditRepository,
  BudgetRepository,
  IdempotencyConflictError,
  IdempotencyRepository,
  OptimisticLockError,
  PaymentRepository,
  WalletRepository,
  WorkspaceRepository,
} from "@/lib/db/repositories";
import { createTestDatabase } from "@/lib/db/testing";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

const capabilities = {
  observable: true,
  ownershipVerified: false,
  userSignable: false,
  agentExecutable: false,
  policyEnforceable: false,
};

describe("workspace-scoped repositories", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  async function createWorkspace(name: string) {
    const repository = new WorkspaceRepository(database);
    return repository.createPersonalWorkspace({
      displayName: name,
      email: `${name.toLowerCase()}@example.com`,
    });
  }

  it("never returns wallets from another workspace", async () => {
    const first = await createWorkspace("Alice");
    const second = await createWorkspace("Bob");
    const repository = new WalletRepository(database);

    await repository.create(first, {
      address: "0x1111111111111111111111111111111111111111",
      chainId: 5_042_002,
      source: "manual",
      label: "Alice wallet",
      capabilities,
    });
    const bobWallet = await repository.create(second, {
      address: "0x2222222222222222222222222222222222222222",
      chainId: 5_042_002,
      source: "manual",
      label: "Bob wallet",
      capabilities,
    });

    await expect(repository.list(first)).resolves.toMatchObject([
      { workspaceId: first.workspaceId, label: "Alice wallet" },
    ]);
    await expect(repository.getById(first, bobWallet.id)).resolves.toBeNull();
  });

  it("ingests payment events idempotently and preserves exact amounts", async () => {
    const scope = await createWorkspace("Payments");
    const wallet = await new WalletRepository(database).create(scope, {
      address: "0x3333333333333333333333333333333333333333",
      chainId: 5_042_002,
      source: "external",
      label: "Payment wallet",
      capabilities,
    });
    const repository = new PaymentRepository(database);
    const payment = {
      walletId: wallet.id,
      externalId: "circle-settlement-1",
      amount: "0.000001",
      occurredAt: new Date("2026-06-20T00:00:00.000Z"),
      source: "circle_gateway" as const,
      providerName: "Paid API",
    };

    const first = await repository.ingest(scope, payment);
    const replay = await repository.ingest(scope, payment);

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.payment.id).toBe(first.payment.id);
    expect(replay.payment.amount).toBe("0.000001");
    await expect(repository.list(scope)).resolves.toHaveLength(1);
  });

  it("uses optimistic versions to prevent lost budget updates", async () => {
    const scope = await createWorkspace("Budgets");
    const repository = new BudgetRepository(database);
    const budget = await repository.create(scope, {
      periodType: "daily",
      periodStart: new Date("2026-06-20T00:00:00.000Z"),
      periodEnd: new Date("2026-06-21T00:00:00.000Z"),
      amount: "1.5",
      warningThreshold: 80,
    });

    const updated = await repository.update(scope, {
      budgetId: budget.id,
      expectedVersion: 1,
      amount: "2.000001",
    });
    expect(updated).toMatchObject({ amount: "2.000001", version: 2 });

    await expect(
      repository.update(scope, {
        budgetId: budget.id,
        expectedVersion: 1,
        amount: "3",
      }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it("deduplicates equivalent requests and rejects idempotency key reuse", async () => {
    const scope = await createWorkspace("Idempotency");
    const repository = new IdempotencyRepository(database);
    const first = await repository.claim(scope, {
      operation: "budget.create",
      key: "request-1",
      request: { amount: "1", nested: { b: 2, a: 1 } },
    });
    expect(first.state).toBe("claimed");

    await repository.complete(scope, { id: first.record.id, response: { budgetId: "budget-1" } });
    const replay = await repository.claim(scope, {
      operation: "budget.create",
      key: "request-1",
      request: { nested: { a: 1, b: 2 }, amount: "1" },
    });
    expect(replay).toMatchObject({
      state: "completed",
      record: { response: { budgetId: "budget-1" } },
    });

    await expect(
      repository.claim(scope, {
        operation: "budget.create",
        key: "request-1",
        request: { amount: "999" },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("records auditable mutations with actor and source", async () => {
    const scope = await createWorkspace("Audit");
    const event = await new AuditRepository(database).record(scope, {
      actorUserId: scope.userId,
      action: "wallet.created",
      entityType: "wallet",
      entityId: "wallet-1",
      source: "web",
      idempotencyKey: "request-2",
      payload: { source: "manual" },
    });

    expect(event).toMatchObject({
      workspaceId: scope.workspaceId,
      actorUserId: scope.userId,
      action: "wallet.created",
      idempotencyKey: "request-2",
    });
  });
});
