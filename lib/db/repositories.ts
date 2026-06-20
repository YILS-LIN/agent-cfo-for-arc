import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";

import type { AppDatabase, WorkspaceScope } from "@/lib/db/database";
import {
  auditEvents,
  budgets,
  idempotencyKeys,
  paymentEvents,
  users,
  wallets,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import {
  createBudgetInputSchema,
  createWalletInputSchema,
  ingestPaymentInputSchema,
  type CreateBudgetInput,
  type CreateWalletInput,
  type IngestPaymentInput,
} from "@/lib/db/validation";

export class RepositoryNotFoundError extends Error {}
export class OptimisticLockError extends Error {}
export class IdempotencyConflictError extends Error {}

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
}

export class WalletRepository {
  constructor(private readonly database: AppDatabase) {}

  async list(scope: WorkspaceScope) {
    return this.database
      .select()
      .from(wallets)
      .where(eq(wallets.workspaceId, scope.workspaceId))
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
    return { payment: existing, created: false } as const;
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

  async updateAmount(
    scope: WorkspaceScope,
    input: { budgetId: string; expectedVersion: number; amount: string },
  ) {
    const amount = createBudgetInputSchema.shape.amount.parse(input.amount);
    const [budget] = await this.database
      .update(budgets)
      .set({
        amount,
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

function stableStringify(value: unknown): string {
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
