import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, gte, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";

import type { PersistentRiskRule } from "@/lib/analytics/persistent-risk";
import type { AppDatabase, WorkspaceScope } from "@/lib/db/database";
import { parseUsdc } from "@/lib/domain/usdc";
import {
  aiProviderCredentials,
  analysisSnapshots,
  auditEvents,
  budgetRevisions,
  budgets,
  chainEvents,
  idempotencyKeys,
  paymentEvents,
  providerPolicies,
  riskSignals,
  reports,
  syncCursors,
  tasks,
  transactionIntents,
  users,
  wallets,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import {
  createBudgetInputSchema,
  createTaskInputSchema,
  createWalletInputSchema,
  ingestChainEventInputSchema,
  ingestPaymentInputSchema,
  createTransactionIntentInputSchema,
  setProviderPolicyInputSchema,
  storeAiCredentialInputSchema,
  updateBudgetInputSchema,
  updateTaskStatusInputSchema,
  type CreateBudgetInput,
  type UpdateBudgetInput,
  type CreateTaskInput,
  type CreateWalletInput,
  type IngestChainEventInput,
  type IngestPaymentInput,
  type CreateTransactionIntentInput,
  type SetProviderPolicyInput,
  type StoreAiCredentialInput,
  type UpdateTaskStatusInput,
} from "@/lib/db/validation";

export class RepositoryNotFoundError extends Error {}
export class OptimisticLockError extends Error {}
export class IdempotencyConflictError extends Error {}
export class PaymentReplayConflictError extends Error {}
export class ChainEventReplayConflictError extends Error {}
export class BudgetConflictError extends Error {}

export class WorkspaceRepository {
  constructor(private readonly database: AppDatabase) {}

  async createPersonalWorkspace(input: { email?: string; displayName?: string }) {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const now = new Date();

    await this.database.insert(users).values({
      id: userId,
      email: input.email,
      displayName: input.displayName,
      createdAt: now,
      updatedAt: now,
    });
    await this.database.insert(workspaces).values({
      id: workspaceId,
      name: input.displayName ? `${input.displayName}'s Workspace` : "Personal Workspace",
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    });
    await this.database
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role: "owner", joinedAt: now });

    return { userId, workspaceId };
  }

  async getMembership(userId: string, workspaceId: string) {
    const [membership] = await this.database
      .select()
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)),
      )
      .limit(1);
    return membership ?? null;
  }

  async getSystemContext(workspaceId: string) {
    const [workspace] = await this.database
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) throw new RepositoryNotFoundError("Workspace not found");
    return {
      userId: workspace.ownerId,
      workspaceId,
      role: "owner" as const,
      identities: [],
    };
  }
}

export class WalletRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope, options: { includeArchived?: boolean } = {}) {
    return this.database
      .select()
      .from(wallets)
      .where(
        options.includeArchived
          ? eq(wallets.workspaceId, scope.workspaceId)
          : and(eq(wallets.workspaceId, scope.workspaceId), isNull(wallets.archivedAt)),
      )
      .orderBy(desc(wallets.isPrimary), asc(wallets.createdAt));
  }

  async getById(scope: WorkspaceScope, walletId: string) {
    const [wallet] = await this.database
      .select()
      .from(wallets)
      .where(and(eq(wallets.workspaceId, scope.workspaceId), eq(wallets.id, walletId)))
      .limit(1);
    return wallet ?? null;
  }

  async create(scope: WorkspaceScope, rawInput: CreateWalletInput) {
    const input = createWalletInputSchema.parse(rawInput);
    const now = new Date();
    if (input.isPrimary) {
      await this.database
        .update(wallets)
        .set({ isPrimary: false, updatedAt: now })
        .where(
          and(
            eq(wallets.workspaceId, scope.workspaceId),
            eq(wallets.isPrimary, true),
            isNull(wallets.archivedAt),
          ),
        );
    }
    const [restored] = await this.database
      .update(wallets)
      .set({
        address: input.address,
        source: input.source,
        label: input.label,
        ownershipStatus: input.ownershipStatus,
        capabilities: input.capabilities,
        isPrimary: input.isPrimary,
        externalProvider: input.externalProvider,
        externalWalletId: input.externalWalletId,
        archivedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(wallets.workspaceId, scope.workspaceId),
          eq(wallets.chainId, input.chainId),
          eq(wallets.normalizedAddress, input.address.toLowerCase()),
          sql`${wallets.archivedAt} is not null`,
        ),
      )
      .returning();
    if (restored) return restored;
    const [wallet] = await this.database
      .insert(wallets)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        address: input.address,
        normalizedAddress: input.address.toLowerCase(),
        chainId: input.chainId,
        source: input.source,
        label: input.label,
        isPrimary: input.isPrimary,
        ownershipStatus: input.ownershipStatus,
        capabilities: input.capabilities,
        externalProvider: input.externalProvider,
        externalWalletId: input.externalWalletId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!wallet) throw new Error("Wallet insert returned no row");
    return wallet;
  }

  async archive(scope: WorkspaceScope, walletId: string) {
    const now = new Date();
    const current = await this.getById(scope, walletId);
    const [wallet] = await this.database
      .update(wallets)
      .set({ archivedAt: now, isPrimary: false, updatedAt: now })
      .where(
        and(
          eq(wallets.workspaceId, scope.workspaceId),
          eq(wallets.id, walletId),
          isNull(wallets.archivedAt),
        ),
      )
      .returning();
    if (!wallet) throw new RepositoryNotFoundError("Active workspace wallet not found");
    if (current?.isPrimary) {
      const [replacement] = await this.database
        .select({ id: wallets.id })
        .from(wallets)
        .where(and(eq(wallets.workspaceId, scope.workspaceId), isNull(wallets.archivedAt)))
        .orderBy(asc(wallets.createdAt))
        .limit(1);
      if (replacement) {
        await this.database
          .update(wallets)
          .set({ isPrimary: true, updatedAt: now })
          .where(and(eq(wallets.workspaceId, scope.workspaceId), eq(wallets.id, replacement.id)));
      }
    }
    return wallet;
  }

  async setPrimary(scope: WorkspaceScope, walletId: string) {
    await this.database
      .update(wallets)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(wallets.workspaceId, scope.workspaceId));
    const [wallet] = await this.database
      .update(wallets)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(and(eq(wallets.workspaceId, scope.workspaceId), eq(wallets.id, walletId)))
      .returning();
    if (!wallet) throw new RepositoryNotFoundError("Wallet not found");
    return wallet;
  }

  async updateSyncState(
    scope: WorkspaceScope,
    walletId: string,
    input: { status: "syncing" | "ready" | "partial" | "failed"; syncedAt?: Date },
  ) {
    const [wallet] = await this.database
      .update(wallets)
      .set({
        syncStatus: input.status,
        lastSyncedAt: input.syncedAt,
        updatedAt: new Date(),
      })
      .where(and(eq(wallets.workspaceId, scope.workspaceId), eq(wallets.id, walletId)))
      .returning();
    if (!wallet) throw new RepositoryNotFoundError("Wallet not found");
    return wallet;
  }
}

export class PaymentRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(
    scope: WorkspaceScope,
    filters: { walletId?: string; from?: Date; to?: Date; limit?: number } = {},
  ) {
    const conditions = [eq(paymentEvents.workspaceId, scope.workspaceId)];
    if (filters.walletId) conditions.push(eq(paymentEvents.walletId, filters.walletId));
    if (filters.from) conditions.push(gt(paymentEvents.occurredAt, filters.from));
    if (filters.to) conditions.push(lt(paymentEvents.occurredAt, filters.to));

    return this.database
      .select()
      .from(paymentEvents)
      .where(and(...conditions))
      .orderBy(desc(paymentEvents.occurredAt))
      .limit(Math.min(filters.limit ?? 500, 1_000));
  }

  async ingest(scope: WorkspaceScope, rawInput: IngestPaymentInput) {
    const input = ingestPaymentInputSchema.parse(rawInput);
    const [inserted] = await this.database
      .insert(paymentEvents)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        ...input,
      })
      .onConflictDoNothing({
        target: [paymentEvents.workspaceId, paymentEvents.source, paymentEvents.externalId],
      })
      .returning();

    if (inserted) return { payment: inserted, created: true } as const;

    const [existing] = await this.database
      .select()
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.workspaceId, scope.workspaceId),
          eq(paymentEvents.source, input.source),
          eq(paymentEvents.externalId, input.externalId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Payment conflict occurred without an existing row");
    const sameEvent =
      existing.walletId === input.walletId &&
      (existing.taskId ?? undefined) === input.taskId &&
      (existing.chainEventId ?? undefined) === input.chainEventId &&
      (existing.transactionHash ?? undefined) === input.transactionHash &&
      parseUsdc(existing.amount) === parseUsdc(input.amount) &&
      (existing.providerId ?? undefined) === input.providerId &&
      (existing.providerName ?? undefined) === input.providerName &&
      (existing.category ?? undefined) === input.category &&
      (existing.resourceUri ?? undefined) === input.resourceUri &&
      existing.occurredAt.getTime() === input.occurredAt.getTime() &&
      (existing.rawReference ?? undefined) === input.rawReference &&
      stableStringify(existing.metadata) === stableStringify(input.metadata);
    if (!sameEvent) {
      throw new PaymentReplayConflictError(
        "Payment source and external ID were reused with different immutable fields",
      );
    }
    return { payment: existing, created: false } as const;
  }

  async listForAnalysis(
    scope: WorkspaceScope,
    filters: { from: Date; to: Date; walletId?: string },
  ) {
    const conditions = [
      eq(paymentEvents.workspaceId, scope.workspaceId),
      gte(paymentEvents.occurredAt, filters.from),
      lt(paymentEvents.occurredAt, filters.to),
    ];
    if (filters.walletId) conditions.push(eq(paymentEvents.walletId, filters.walletId));
    return this.database
      .select()
      .from(paymentEvents)
      .where(and(...conditions))
      .orderBy(asc(paymentEvents.occurredAt), asc(paymentEvents.id))
      .limit(10_001);
  }
}

export class ChainEventRepository {
  constructor(private readonly database: AppDatabase) {}

  async ingest(rawInput: IngestChainEventInput) {
    const input = ingestChainEventInputSchema.parse(rawInput);
    const [inserted] = await this.database
      .insert(chainEvents)
      .values({ id: randomUUID(), ...input })
      .onConflictDoNothing({
        target: [chainEvents.chainId, chainEvents.transactionHash, chainEvents.eventIndex],
      })
      .returning();
    if (inserted) return { chainEvent: inserted, created: true } as const;

    const [existing] = await this.database
      .select()
      .from(chainEvents)
      .where(
        and(
          eq(chainEvents.chainId, input.chainId),
          eq(chainEvents.transactionHash, input.transactionHash),
          eq(chainEvents.eventIndex, input.eventIndex),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Chain event conflict occurred without an existing row");
    const sameEvent =
      existing.blockNumber === input.blockNumber &&
      (existing.blockHash ?? undefined) === input.blockHash &&
      existing.contractAddress.toLowerCase() === input.contractAddress.toLowerCase() &&
      existing.eventName === input.eventName &&
      existing.occurredAt.getTime() === input.occurredAt.getTime() &&
      stableStringify(existing.payload) === stableStringify(input.payload);
    if (!sameEvent) {
      throw new ChainEventReplayConflictError(
        "Chain event identity was reused with different immutable fields",
      );
    }
    return { chainEvent: existing, created: false } as const;
  }
}

export class TaskRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, scope.workspaceId))
      .orderBy(desc(tasks.updatedAt), desc(tasks.createdAt));
  }

  async getById(scope: WorkspaceScope, taskId: string) {
    const [task] = await this.database
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, scope.workspaceId), eq(tasks.id, taskId)))
      .limit(1);
    return task ?? null;
  }

  async create(scope: WorkspaceScope, rawInput: CreateTaskInput) {
    const input = createTaskInputSchema.parse(rawInput);
    const now = new Date();
    const [task] = await this.database
      .insert(tasks)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        ...input,
        startedAt: input.status === "running" ? now : undefined,
        completedAt: input.status === "completed" ? now : undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!task) throw new Error("Task insert returned no row");
    return task;
  }

  async updateStatus(scope: WorkspaceScope, rawInput: UpdateTaskStatusInput) {
    const input = updateTaskStatusInputSchema.parse(rawInput);
    const now = new Date();
    const [task] = await this.database
      .update(tasks)
      .set({
        status: input.status,
        version: sql`${tasks.version} + 1`,
        updatedAt: now,
        ...(input.status === "pending" ? { startedAt: null, completedAt: null } : {}),
        ...(input.status === "running" ? { startedAt: now, completedAt: null } : {}),
        ...(input.status === "paused" ? { completedAt: null } : {}),
        ...(input.status === "completed" || input.status === "failed" ? { completedAt: now } : {}),
      })
      .where(
        and(
          eq(tasks.workspaceId, scope.workspaceId),
          eq(tasks.id, input.taskId),
          eq(tasks.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!task) throw new OptimisticLockError("Task was updated by another request or not found");
    return task;
  }
}

export class TransactionIntentRepository {
  constructor(private readonly database: AppDatabase) {}

  async getById(scope: WorkspaceScope, intentId: string) {
    const [intent] = await this.database
      .select()
      .from(transactionIntents)
      .where(and(eq(transactionIntents.workspaceId, scope.workspaceId), eq(transactionIntents.id, intentId)))
      .limit(1);
    return intent ?? null;
  }

  async create(
    scope: WorkspaceScope,
    rawInput: CreateTransactionIntentInput & { createdBy?: string },
  ) {
    const input = createTransactionIntentInputSchema.parse(rawInput);
    const [intent] = await this.database
      .insert(transactionIntents)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        walletId: input.walletId,
        budgetId: input.budgetId,
        taskId: input.taskId,
        chainId: input.chainId,
        recipientAddress: input.recipientAddress,
        amount: input.amount,
        reason: input.reason,
        riskSnapshot: input.riskSnapshot,
        metadata: input.metadata,
        createdBy: rawInput.createdBy,
        expiresAt: input.expiresAt,
      })
      .returning();
    if (!intent) throw new Error("Transaction intent insert returned no row");
    return intent;
  }
}

export class BudgetRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(budgets)
      .where(eq(budgets.workspaceId, scope.workspaceId))
      .orderBy(desc(budgets.createdAt));
  }

  async getById(scope: WorkspaceScope, budgetId: string) {
    const [budget] = await this.database
      .select()
      .from(budgets)
      .where(and(eq(budgets.workspaceId, scope.workspaceId), eq(budgets.id, budgetId)))
      .limit(1);
    return budget ?? null;
  }

  async create(scope: WorkspaceScope, rawInput: CreateBudgetInput) {
    const input = createBudgetInputSchema.parse(rawInput);
    const now = new Date();
    const [budget] = await this.database
      .insert(budgets)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        ...input,
        warningThreshold: String(input.warningThreshold),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!budget) throw new Error("Budget insert returned no row");
    return budget;
  }

  async findOverlap(
    scope: WorkspaceScope,
    input: {
      budgetId?: string;
      walletId?: string | null;
      taskId?: string | null;
      providerId?: string | null;
      periodStart: Date;
      periodEnd: Date;
    },
  ) {
    const sameScope = input.walletId
      ? eq(budgets.walletId, input.walletId)
      : input.taskId
        ? eq(budgets.taskId, input.taskId)
        : input.providerId
          ? eq(budgets.providerId, input.providerId)
          : and(isNull(budgets.walletId), isNull(budgets.taskId), isNull(budgets.providerId));
    const [conflict] = await this.database
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.workspaceId, scope.workspaceId),
          sameScope,
          ne(budgets.status, "archived"),
          lt(budgets.periodStart, input.periodEnd),
          gt(budgets.periodEnd, input.periodStart),
          input.budgetId ? ne(budgets.id, input.budgetId) : undefined,
        ),
      )
      .limit(1);
    return conflict ?? null;
  }

  async update(scope: WorkspaceScope, rawInput: UpdateBudgetInput) {
    const input = updateBudgetInputSchema.parse(rawInput);
    const current = await this.getById(scope, input.budgetId);
    if (!current) throw new RepositoryNotFoundError("Workspace budget not found");
    if (current.status === "archived") {
      throw new BudgetConflictError("Archived budgets are immutable");
    }
    const periodStart = input.periodStart ?? current.periodStart;
    const periodEnd = input.periodEnd ?? current.periodEnd;
    if (periodEnd <= periodStart)
      throw new BudgetConflictError("Budget period end must be after its start");
    if (input.status !== "archived") {
      const overlap = await this.findOverlap(scope, {
        budgetId: current.id,
        walletId: current.walletId,
        taskId: current.taskId,
        providerId: current.providerId,
        periodStart,
        periodEnd,
      });
      if (overlap)
        throw new BudgetConflictError(
          "Budget period overlaps another active or paused budget at the same scope level",
        );
    }
    const [budget] = await this.database
      .update(budgets)
      .set({
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.warningThreshold !== undefined
          ? { warningThreshold: String(input.warningThreshold) }
          : {}),
        ...(input.periodStart !== undefined ? { periodStart: input.periodStart } : {}),
        ...(input.periodEnd !== undefined ? { periodEnd: input.periodEnd } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        version: sql`${budgets.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgets.workspaceId, scope.workspaceId),
          eq(budgets.id, input.budgetId),
          eq(budgets.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!budget) throw new OptimisticLockError("Budget was updated by another request");
    return budget;
  }
}

function budgetSnapshot(budget: typeof budgets.$inferSelect) {
  return {
    walletId: budget.walletId,
    taskId: budget.taskId,
    providerId: budget.providerId,
    periodType: budget.periodType,
    periodStart: budget.periodStart.toISOString(),
    periodEnd: budget.periodEnd.toISOString(),
    amount: budget.amount,
    warningThreshold: budget.warningThreshold,
    hardLimitRequested: budget.hardLimitRequested,
    status: budget.status,
  };
}

export class BudgetRevisionRepository {
  constructor(private readonly database: AppDatabase) {}

  list(scope: WorkspaceScope, budgetId: string) {
    return this.database
      .select()
      .from(budgetRevisions)
      .where(
        and(
          eq(budgetRevisions.workspaceId, scope.workspaceId),
          eq(budgetRevisions.budgetId, budgetId),
        ),
      )
      .orderBy(desc(budgetRevisions.version));
  }

  async record(
    scope: WorkspaceScope,
    budget: typeof budgets.$inferSelect,
    input: {
      action: string;
      actorUserId?: string;
      source: "web" | "mcp" | "system";
      idempotencyKey?: string;
    },
  ) {
    const { action, ...metadata } = input;
    const [revision] = await this.database
      .insert(budgetRevisions)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        budgetId: budget.id,
        version: budget.version,
        action,
        snapshot: budgetSnapshot(budget),
        ...metadata,
      })
      .returning();
    if (!revision) throw new Error("Budget revision insert returned no row");
    return revision;
  }
}

export class AuditRepository {
  constructor(private readonly database: AppDatabase) {}

  async record(
    scope: WorkspaceScope,
    input: {
      actorUserId?: string;
      action: string;
      entityType: string;
      entityId: string;
      source: "web" | "mcp" | "system";
      idempotencyKey?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    const [event] = await this.database
      .insert(auditEvents)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        ...input,
        payload: input.payload ?? {},
      })
      .returning();
    if (!event) throw new Error("Audit event insert returned no row");
    return event;
  }
}

export class AnalysisRepository {
  constructor(private readonly database: AppDatabase) {}

  async createOrGet(
    scope: WorkspaceScope,
    input: {
      rangeStart: Date;
      rangeEnd: Date;
      version: string;
      inputHash: string;
      result: Record<string, unknown>;
    },
  ) {
    const [created] = await this.database
      .insert(analysisSnapshots)
      .values({ id: randomUUID(), workspaceId: scope.workspaceId, ...input })
      .onConflictDoNothing({
        target: [
          analysisSnapshots.workspaceId,
          analysisSnapshots.inputHash,
          analysisSnapshots.version,
        ],
      })
      .returning();
    if (created) return { snapshot: created, created: true } as const;

    const [existing] = await this.database
      .select()
      .from(analysisSnapshots)
      .where(
        and(
          eq(analysisSnapshots.workspaceId, scope.workspaceId),
          eq(analysisSnapshots.inputHash, input.inputHash),
          eq(analysisSnapshots.version, input.version),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Analysis conflict occurred without an existing snapshot");
    return { snapshot: existing, created: false } as const;
  }
}

export class RiskRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(
    scope: WorkspaceScope,
    filters: {
      status?: "open" | "investigating" | "resolved";
      severity?: "low" | "medium" | "high";
    } = {},
  ) {
    const conditions = [eq(riskSignals.workspaceId, scope.workspaceId)];
    if (filters.status) conditions.push(eq(riskSignals.status, filters.status));
    if (filters.severity) conditions.push(eq(riskSignals.severity, filters.severity));
    return this.database
      .select()
      .from(riskSignals)
      .where(and(...conditions))
      .orderBy(desc(riskSignals.detectedAt), desc(riskSignals.updatedAt));
  }

  async getById(scope: WorkspaceScope, riskId: string) {
    const [risk] = await this.database
      .select()
      .from(riskSignals)
      .where(and(eq(riskSignals.workspaceId, scope.workspaceId), eq(riskSignals.id, riskId)))
      .limit(1);
    return risk ?? null;
  }

  async upsertForSnapshot(
    scope: WorkspaceScope,
    input: { analysisSnapshotId: string; rules: PersistentRiskRule[] },
  ) {
    if (input.rules.length === 0) return [];
    const now = new Date();
    return this.database
      .insert(riskSignals)
      .values(
        input.rules.map((rule) => ({
          id: randomUUID(),
          workspaceId: scope.workspaceId,
          analysisSnapshotId: input.analysisSnapshotId,
          walletId: rule.walletId,
          taskId: rule.taskId,
          ruleId: rule.ruleId,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          evidence: { ...rule.evidence, rule: rule.rule },
          detectedAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [riskSignals.workspaceId, riskSignals.ruleId],
        set: {
          analysisSnapshotId: input.analysisSnapshotId,
          severity: sql`excluded.severity`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          evidence: sql`excluded.evidence`,
          updatedAt: now,
        },
      })
      .returning();
  }

  async resolveStale(scope: WorkspaceScope, currentRuleIds: string[]) {
    const conditions = [
      eq(riskSignals.workspaceId, scope.workspaceId),
      ne(riskSignals.status, "resolved"),
    ];
    if (currentRuleIds.length > 0) {
      conditions.push(notInArray(riskSignals.ruleId, currentRuleIds));
    }
    return this.database
      .update(riskSignals)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${riskSignals.version} + 1`,
      })
      .where(and(...conditions))
      .returning();
  }

  async updateStatus(
    scope: WorkspaceScope,
    input: {
      riskId: string;
      expectedVersion: number;
      status: "open" | "investigating" | "resolved";
    },
  ) {
    const now = new Date();
    const [risk] = await this.database
      .update(riskSignals)
      .set({
        status: input.status,
        resolvedAt: input.status === "resolved" ? now : null,
        updatedAt: now,
        version: sql`${riskSignals.version} + 1`,
      })
      .where(
        and(
          eq(riskSignals.workspaceId, scope.workspaceId),
          eq(riskSignals.id, input.riskId),
          eq(riskSignals.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!risk)
      throw new OptimisticLockError("Risk signal was updated by another request or not found");
    return risk;
  }
}

export class SyncLeaseUnavailableError extends Error {}

export class SyncRepository {
  constructor(private readonly database: AppDatabase) {}

  async acquire(
    scope: WorkspaceScope,
    input: {
      walletId: string;
      source: "arc" | "circle_gateway" | "x402" | "demo";
      leaseMs?: number;
    },
  ) {
    const now = new Date();
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 60_000));
    const [cursor] = await this.database
      .insert(syncCursors)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        walletId: input.walletId,
        source: input.source,
        status: "syncing",
        leaseToken,
        leaseExpiresAt,
        lastAttemptedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [syncCursors.walletId, syncCursors.source],
        set: {
          status: "syncing",
          leaseToken,
          leaseExpiresAt,
          lastError: null,
          lastAttemptedAt: now,
          updatedAt: now,
        },
        setWhere: or(
          ne(syncCursors.status, "syncing"),
          isNull(syncCursors.leaseExpiresAt),
          lt(syncCursors.leaseExpiresAt, now),
        ),
      })
      .returning();
    if (!cursor) throw new SyncLeaseUnavailableError("Wallet sync is already running");
    if (cursor.workspaceId !== scope.workspaceId) {
      throw new RepositoryNotFoundError("Sync cursor does not belong to this workspace");
    }
    return cursor;
  }

  async complete(
    scope: WorkspaceScope,
    input: { id: string; leaseToken: string; cursor?: string; status?: "ready" | "partial" },
  ) {
    const now = new Date();
    const [record] = await this.database
      .update(syncCursors)
      .set({
        cursor: input.cursor,
        status: input.status ?? "ready",
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: null,
        lastSucceededAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(syncCursors.workspaceId, scope.workspaceId),
          eq(syncCursors.id, input.id),
          eq(syncCursors.leaseToken, input.leaseToken),
        ),
      )
      .returning();
    if (!record) throw new SyncLeaseUnavailableError("Wallet sync lease expired before completion");
    return record;
  }

  async fail(scope: WorkspaceScope, input: { id: string; leaseToken: string; error: string }) {
    const [record] = await this.database
      .update(syncCursors)
      .set({
        status: "failed",
        leaseToken: null,
        leaseExpiresAt: null,
        lastError: input.error.slice(0, 1_000),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(syncCursors.workspaceId, scope.workspaceId),
          eq(syncCursors.id, input.id),
          eq(syncCursors.leaseToken, input.leaseToken),
        ),
      )
      .returning();
    return record ?? null;
  }

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(syncCursors)
      .where(eq(syncCursors.workspaceId, scope.workspaceId))
      .orderBy(desc(syncCursors.updatedAt));
  }
}

export class ProviderPolicyRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(providerPolicies)
      .where(eq(providerPolicies.workspaceId, scope.workspaceId))
      .orderBy(asc(providerPolicies.displayName));
  }

  async getByKey(scope: WorkspaceScope, providerKey: string) {
    const [policy] = await this.database
      .select()
      .from(providerPolicies)
      .where(
        and(
          eq(providerPolicies.workspaceId, scope.workspaceId),
          eq(providerPolicies.providerKey, providerKey),
        ),
      )
      .limit(1);
    return policy ?? null;
  }

  async getById(scope: WorkspaceScope, policyId: string) {
    const [policy] = await this.database
      .select()
      .from(providerPolicies)
      .where(
        and(eq(providerPolicies.workspaceId, scope.workspaceId), eq(providerPolicies.id, policyId)),
      )
      .limit(1);
    return policy ?? null;
  }

  async set(scope: WorkspaceScope, rawInput: SetProviderPolicyInput) {
    const input = setProviderPolicyInputSchema.parse(rawInput);
    const now = new Date();
    if (input.expectedVersion === 0) {
      const [created] = await this.database
        .insert(providerPolicies)
        .values({
          id: randomUUID(),
          workspaceId: scope.workspaceId,
          providerKey: input.providerKey,
          displayName: input.displayName,
          decision: input.decision,
          updatedBy: input.updatedBy,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [providerPolicies.workspaceId, providerPolicies.providerKey],
        })
        .returning();
      if (!created) {
        throw new OptimisticLockError("Provider policy was created by another request");
      }
      return created;
    }

    const [updated] = await this.database
      .update(providerPolicies)
      .set({
        displayName: input.displayName,
        decision: input.decision,
        updatedBy: input.updatedBy,
        version: sql`${providerPolicies.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(providerPolicies.workspaceId, scope.workspaceId),
          eq(providerPolicies.providerKey, input.providerKey),
          eq(providerPolicies.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) {
      throw new OptimisticLockError("Provider policy was updated by another request or not found");
    }
    return updated;
  }
}

export class AiCredentialRepository {
  constructor(private readonly database: AppDatabase) {}

  async listSafe(scope: WorkspaceScope) {
    return this.database
      .select({
        id: aiProviderCredentials.id,
        provider: aiProviderCredentials.provider,
        model: aiProviderCredentials.model,
        secretHint: aiProviderCredentials.secretHint,
        status: aiProviderCredentials.status,
        version: aiProviderCredentials.version,
        lastVerifiedAt: aiProviderCredentials.lastVerifiedAt,
        lastErrorCode: aiProviderCredentials.lastErrorCode,
        updatedAt: aiProviderCredentials.updatedAt,
      })
      .from(aiProviderCredentials)
      .where(eq(aiProviderCredentials.workspaceId, scope.workspaceId))
      .orderBy(asc(aiProviderCredentials.provider));
  }

  async getByProvider(scope: WorkspaceScope, provider: string) {
    const [credential] = await this.database
      .select()
      .from(aiProviderCredentials)
      .where(
        and(
          eq(aiProviderCredentials.workspaceId, scope.workspaceId),
          eq(aiProviderCredentials.provider, provider),
        ),
      )
      .limit(1);
    return credential ?? null;
  }

  async store(scope: WorkspaceScope, rawInput: StoreAiCredentialInput) {
    const input = storeAiCredentialInputSchema.parse(rawInput);
    const now = new Date();
    const values = {
      model: input.model,
      encryptedSecret: input.encryptedSecret,
      encryptionIv: input.encryptionIv,
      encryptionAuthTag: input.encryptionAuthTag,
      encryptionKeyId: input.encryptionKeyId,
      secretHint: input.secretHint,
      status: "unverified" as const,
      lastVerifiedAt: null,
      lastErrorCode: null,
      updatedBy: input.actorUserId,
      updatedAt: now,
    };
    if (input.expectedVersion === 0) {
      const [created] = await this.database
        .insert(aiProviderCredentials)
        .values({
          id: randomUUID(),
          workspaceId: scope.workspaceId,
          provider: input.provider,
          ...values,
          createdBy: input.actorUserId,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [aiProviderCredentials.workspaceId, aiProviderCredentials.provider],
        })
        .returning();
      if (!created) throw new OptimisticLockError("AI credential was created by another request");
      return created;
    }

    const [updated] = await this.database
      .update(aiProviderCredentials)
      .set({ ...values, version: sql`${aiProviderCredentials.version} + 1` })
      .where(
        and(
          eq(aiProviderCredentials.workspaceId, scope.workspaceId),
          eq(aiProviderCredentials.provider, input.provider),
          eq(aiProviderCredentials.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) {
      throw new OptimisticLockError("AI credential was updated by another request or not found");
    }
    return updated;
  }

  async delete(scope: WorkspaceScope, input: { provider: string; expectedVersion: number }) {
    const [deleted] = await this.database
      .delete(aiProviderCredentials)
      .where(
        and(
          eq(aiProviderCredentials.workspaceId, scope.workspaceId),
          eq(aiProviderCredentials.provider, input.provider),
          eq(aiProviderCredentials.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!deleted) {
      throw new OptimisticLockError("AI credential was updated by another request or not found");
    }
    return deleted;
  }

  async markStatus(
    scope: WorkspaceScope,
    input: { provider: string; status: "valid" | "invalid"; errorCode?: string },
  ) {
    const [updated] = await this.database
      .update(aiProviderCredentials)
      .set({
        status: input.status,
        lastVerifiedAt: new Date(),
        lastErrorCode: input.errorCode,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(aiProviderCredentials.workspaceId, scope.workspaceId),
          eq(aiProviderCredentials.provider, input.provider),
        ),
      )
      .returning();
    if (!updated) throw new RepositoryNotFoundError("AI credential not found");
    return updated;
  }
}

export class ReportRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(reports)
      .where(eq(reports.workspaceId, scope.workspaceId))
      .orderBy(desc(reports.createdAt));
  }

  async getById(scope: WorkspaceScope, reportId: string) {
    const [report] = await this.database
      .select()
      .from(reports)
      .where(and(eq(reports.workspaceId, scope.workspaceId), eq(reports.id, reportId)))
      .limit(1);
    return report ?? null;
  }

  async createPending(
    scope: WorkspaceScope,
    input: {
      title: string;
      provider: string;
      model: string;
      promptVersion: string;
      createdBy: string;
    },
  ) {
    const now = new Date();
    const [report] = await this.database
      .insert(reports)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        status: "pending",
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!report) throw new Error("Report insert returned no row");
    return report;
  }

  async complete(
    scope: WorkspaceScope,
    input: { reportId: string; content: Record<string, unknown> },
  ) {
    const now = new Date();
    const [report] = await this.database
      .update(reports)
      .set({
        status: "completed",
        content: input.content,
        errorCode: null,
        generatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(reports.workspaceId, scope.workspaceId), eq(reports.id, input.reportId)))
      .returning();
    if (!report) throw new RepositoryNotFoundError("Report not found");
    return report;
  }

  async fail(scope: WorkspaceScope, input: { reportId: string; errorCode: string }) {
    const [report] = await this.database
      .update(reports)
      .set({ status: "failed", errorCode: input.errorCode, updatedAt: new Date() })
      .where(and(eq(reports.workspaceId, scope.workspaceId), eq(reports.id, input.reportId)))
      .returning();
    return report ?? null;
  }
}

function stableStringify(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashRequest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export class IdempotencyRepository {
  constructor(private readonly database: AppDatabase) {}

  async claim(
    scope: WorkspaceScope,
    input: { operation: string; key: string; request: unknown; ttlMs?: number },
  ) {
    const now = new Date();
    const requestHash = hashRequest(input.request);
    await this.database
      .delete(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.workspaceId, scope.workspaceId),
          eq(idempotencyKeys.operation, input.operation),
          eq(idempotencyKeys.key, input.key),
          lt(idempotencyKeys.expiresAt, now),
        ),
      );

    const [claimed] = await this.database
      .insert(idempotencyKeys)
      .values({
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        operation: input.operation,
        key: input.key,
        requestHash,
        expiresAt: new Date(now.getTime() + (input.ttlMs ?? 24 * 60 * 60 * 1_000)),
      })
      .onConflictDoNothing({
        target: [idempotencyKeys.workspaceId, idempotencyKeys.operation, idempotencyKeys.key],
      })
      .returning();
    if (claimed) return { state: "claimed", record: claimed } as const;

    const [existing] = await this.database
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.workspaceId, scope.workspaceId),
          eq(idempotencyKeys.operation, input.operation),
          eq(idempotencyKeys.key, input.key),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Idempotency conflict occurred without an existing row");
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError("Idempotency key was reused with a different request");
    }
    return { state: existing.status, record: existing } as const;
  }

  async complete(scope: WorkspaceScope, input: { id: string; response: Record<string, unknown> }) {
    const [record] = await this.database
      .update(idempotencyKeys)
      .set({ status: "completed", response: input.response })
      .where(
        and(eq(idempotencyKeys.workspaceId, scope.workspaceId), eq(idempotencyKeys.id, input.id)),
      )
      .returning();
    if (!record) throw new RepositoryNotFoundError("Idempotency record not found");
    return record;
  }

  async fail(scope: WorkspaceScope, input: { id: string; errorCode: string }) {
    const [record] = await this.database
      .update(idempotencyKeys)
      .set({ status: "failed", response: { errorCode: input.errorCode } })
      .where(
        and(eq(idempotencyKeys.workspaceId, scope.workspaceId), eq(idempotencyKeys.id, input.id)),
      )
      .returning();
    if (!record) throw new RepositoryNotFoundError("Idempotency record not found");
    return record;
  }
}
