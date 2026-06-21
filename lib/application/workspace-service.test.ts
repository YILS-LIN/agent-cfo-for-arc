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
  BudgetConflictError,
  IdempotencyConflictError,
  OptimisticLockError,
  PaymentReplayConflictError,
  RepositoryNotFoundError,
  WorkspaceRepository,
} from "@/lib/db/repositories";
import {
  auditEvents,
  analysisSnapshots,
  budgetRevisions,
  budgets,
  idempotencyKeys,
  paymentEvents,
  providerPolicies,
  riskSignals,
  tasks,
  wallets,
} from "@/lib/db/schema";
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
    const updated = await service.updateBudget(
      owner,
      {
        budgetId: first.budget.id,
        expectedVersion: 1,
        amount: "12.000001",
      },
      "budget-update-1",
    );

    expect(replay).toMatchObject({ replayed: true, budget: { id: first.budget.id } });
    expect(first.budget.createdBy).toBe(owner.userId);
    expect(updated).toMatchObject({ budget: { amount: "12.000001", version: 2 } });
    const updateReplay = await service.updateBudget(
      owner,
      {
        budgetId: first.budget.id,
        expectedVersion: 1,
        amount: "12.000001",
      },
      "budget-update-1",
    );
    expect(updateReplay).toMatchObject({ replayed: true, budget: { version: 2 } });
    await expect(
      service.updateBudget(
        owner,
        {
          budgetId: first.budget.id,
          expectedVersion: 1,
          amount: "13",
        },
        "budget-update-2",
      ),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(
      service.createBudget(owner, budgetInput(), "overlapping-budget"),
    ).rejects.toBeInstanceOf(BudgetConflictError);
    const paused = await service.updateBudget(
      owner,
      { budgetId: first.budget.id, expectedVersion: 2, status: "paused" },
      "budget-pause",
    );
    const archived = await service.updateBudget(
      owner,
      { budgetId: first.budget.id, expectedVersion: paused.budget.version, status: "archived" },
      "budget-archive",
    );
    await expect(
      service.updateBudget(
        owner,
        { budgetId: first.budget.id, expectedVersion: archived.budget.version, amount: "20" },
        "budget-after-archive",
      ),
    ).rejects.toBeInstanceOf(BudgetConflictError);
    const detail = await service.getBudget(owner, first.budget.id);
    expect(detail.revisions.map((revision) => revision.version)).toEqual([4, 3, 2, 1]);
    await expect(database.select().from(budgets)).resolves.toHaveLength(1);
    await expect(database.select().from(budgetRevisions)).resolves.toHaveLength(4);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(4);
  });

  it("creates and replays tasks, then protects status updates with versions", async () => {
    const first = await service.createTask(
      owner,
      { name: "Research suppliers", status: "running", externalKey: "task-external-1" },
      "task-request-1",
    );
    const replay = await service.createTask(
      owner,
      { externalKey: "task-external-1", status: "running", name: "Research suppliers" },
      "task-request-1",
    );
    const updated = await service.updateTaskStatus(owner, {
      taskId: first.task.id,
      expectedVersion: 1,
      status: "paused",
    });

    expect(replay).toMatchObject({ replayed: true, task: { id: first.task.id } });
    expect(updated).toMatchObject({ status: "paused", version: 2 });
    await expect(
      service.updateTaskStatus(owner, {
        taskId: first.task.id,
        expectedVersion: 1,
        status: "completed",
      }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(database.select().from(tasks)).resolves.toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(2);
  });

  it("ingests payment events once, audits creation, and rejects conflicting replays", async () => {
    const wallet = await service.createWallet(owner, walletInput(), "payment-wallet");
    const payment = {
      walletId: wallet.wallet.id,
      externalId: "x402-payment-1",
      transactionHash: "0xabc123",
      amount: "0.000001",
      occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      source: "x402" as const,
      providerName: "Research API",
      metadata: { requestId: "request-1" },
    };

    const first = await service.ingestPayment(owner, payment);
    const replay = await service.ingestPayment(owner, payment);

    expect(first.created).toBe(true);
    expect(replay).toMatchObject({ created: false, payment: { id: first.payment.id } });
    await expect(service.ingestPayment(owner, { ...payment, amount: "2" })).rejects.toBeInstanceOf(
      PaymentReplayConflictError,
    );
    await expect(database.select().from(paymentEvents)).resolves.toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(2);
  });

  it("rejects payment ingestion through a wallet from another workspace", async () => {
    const otherScope = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "Bob",
      email: "bob@example.com",
    });
    const otherContext: AuthContext = { ...otherScope, role: "owner", identities: [] };
    const otherWallet = await service.createWallet(otherContext, walletInput(), "other-wallet");

    await expect(
      service.ingestPayment(owner, {
        walletId: otherWallet.wallet.id,
        externalId: "cross-tenant-payment",
        amount: "1",
        occurredAt: new Date("2026-06-20T12:00:00.000Z"),
        source: "arc",
      }),
    ).rejects.toBeInstanceOf(RepositoryNotFoundError);
    await expect(database.select().from(paymentEvents)).resolves.toHaveLength(0);
  });

  it("builds tenant-scoped exact workspace aggregates", async () => {
    const wallet = await service.createWallet(owner, walletInput(), "summary-wallet");
    const task = await service.createTask(owner, { name: "Summary task" }, "summary-task");
    await service.createBudget(
      owner,
      {
        walletId: wallet.wallet.id,
        periodType: "daily",
        periodStart: new Date("2026-06-20T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T00:00:00.000Z"),
        amount: "0.000004",
      },
      "summary-budget",
    );
    await service.ingestPayment(owner, {
      walletId: wallet.wallet.id,
      taskId: task.task.id,
      externalId: "summary-payment",
      providerId: "provider-1",
      providerName: "Summary API",
      category: "Data",
      amount: "0.000001",
      occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      source: "x402",
    });

    const summary = await service.getWorkspaceSummary(owner, {
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    });

    expect(summary.metrics).toMatchObject({
      totalSpend: "0.000001",
      paymentCount: 1,
      assignedBudget: "0.000004",
      budgetUsed: 25,
    });
    expect(summary.wallets).toMatchObject([{ spent: "0.000001", budgetUsed: 25 }]);
    expect(summary.tasks).toMatchObject([{ spent: "0.000001", paymentCount: 1 }]);
    expect(summary.providers).toMatchObject([{ name: "Summary API", spent: "0.000001" }]);

    const dashboard = await service.getWorkspaceDashboard(owner, {
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    });
    expect(dashboard).toMatchObject({
      analysis: { source: "workspace", isLive: true },
      metrics: { totalSpend: "0.000001", paymentCount: 1 },
      profile: { wallet: wallet.wallet.address },
    });

    const secondWallet = await service.createWallet(
      owner,
      walletInput("0x2222222222222222222222222222222222222222"),
      "summary-wallet-2",
    );
    await service.ingestPayment(owner, {
      walletId: secondWallet.wallet.id,
      externalId: "summary-payment-2",
      amount: "9",
      occurredAt: new Date("2026-06-20T13:00:00.000Z"),
      source: "arc",
    });
    const walletSummary = await service.getWalletSummary(owner, {
      walletId: wallet.wallet.id,
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    });
    expect(walletSummary).toMatchObject({
      wallet: { id: wallet.wallet.id },
      summary: {
        metrics: { totalSpend: "0.000001", paymentCount: 1 },
        wallets: [{ id: wallet.wallet.id }],
      },
    });
  });

  it("records MCP as the source for idempotent wallet and budget writes", async () => {
    const wallet = await service.createWallet(owner, walletInput(), "mcp-wallet", "mcp");
    await service.createBudget(
      owner,
      { ...budgetInput(), walletId: wallet.wallet.id },
      "mcp-budget",
      "mcp",
    );

    const audits = await database.select().from(auditEvents);
    expect(audits).toMatchObject([
      { action: "wallet.created", source: "mcp", idempotencyKey: "mcp-wallet" },
      { action: "budget.created", source: "mcp", idempotencyKey: "mcp-budget" },
    ]);
  });

  it("persists tenant-scoped provider decisions with optimistic versions", async () => {
    const created = await service.setProviderPolicy(owner, {
      providerKey: "provider-1",
      displayName: "Research API",
      decision: "allowed",
      expectedVersion: 0,
    });
    const updated = await service.setProviderPolicy(owner, {
      providerKey: "provider-1",
      displayName: "Research API",
      decision: "blocked",
      expectedVersion: 1,
    });

    expect(created).toMatchObject({ decision: "allowed", version: 1 });
    expect(updated).toMatchObject({ decision: "blocked", version: 2 });
    await expect(
      service.setProviderPolicy(owner, {
        providerKey: "provider-1",
        displayName: "Research API",
        decision: "review",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
    await expect(service.listProviderPolicies(owner)).resolves.toMatchObject([
      { providerKey: "provider-1", workspaceId: owner.workspaceId },
    ]);
    await expect(database.select().from(providerPolicies)).resolves.toHaveLength(1);
  });

  it("persists deterministic risk analysis, deduplicates replays, and resolves stale signals", async () => {
    const wallet = await service.createWallet(owner, walletInput(), "risk-wallet");
    const budget = await service.createBudget(
      owner,
      {
        walletId: wallet.wallet.id,
        periodType: "daily",
        periodStart: new Date("2026-06-20T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T00:00:00.000Z"),
        amount: "1",
        warningThreshold: 80,
      },
      "risk-budget",
    );
    await service.ingestPayment(owner, {
      walletId: wallet.wallet.id,
      externalId: "risk-payment",
      amount: "1",
      occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      source: "x402",
    });
    const range = {
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    };

    const first = await service.analyzeRisks(owner, range);
    const replay = await service.analyzeRisks(owner, range);
    const [signal] = await service.listRisks(owner);

    expect(first).toMatchObject({ replayed: false, signals: [{ severity: "high" }] });
    expect(replay.replayed).toBe(true);
    expect(signal).toMatchObject({ status: "open", version: 1 });
    await expect(database.select().from(analysisSnapshots)).resolves.toHaveLength(1);
    await expect(database.select().from(riskSignals)).resolves.toHaveLength(1);

    const investigating = await service.updateRiskStatus(owner, {
      riskId: signal!.id,
      expectedVersion: signal!.version,
      status: "investigating",
    });
    expect(investigating).toMatchObject({ status: "investigating", version: 2 });

    await service.updateBudget(
      owner,
      {
        budgetId: budget.budget.id,
        expectedVersion: 1,
        amount: "100",
      },
      "risk-budget-update",
    );
    const recalculated = await service.analyzeRisks(owner, range);
    const [resolved] = await service.listRisks(owner);
    expect(recalculated.resolvedCount).toBe(1);
    expect(resolved).toMatchObject({ status: "resolved", version: 3 });
  });

  it("applies persisted provider policy decisions during risk analysis", async () => {
    const wallet = await service.createWallet(owner, walletInput(), "policy-risk-wallet");
    await service.setProviderPolicy(owner, {
      providerKey: "blocked-provider",
      displayName: "Blocked Provider",
      decision: "blocked",
      expectedVersion: 0,
    });
    await service.ingestPayment(owner, {
      walletId: wallet.wallet.id,
      externalId: "blocked-provider-payment",
      providerId: "blocked-provider",
      amount: "1",
      occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      source: "x402",
    });

    const analysis = await service.analyzeRisks(owner, {
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    });

    expect(analysis.signals).toMatchObject([
      {
        severity: "high",
        evidence: { rule: "provider_policy", providerId: "blocked-provider" },
      },
    ]);
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
