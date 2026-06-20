import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import {
  AuditRepository,
  BudgetRepository,
  IdempotencyRepository,
  RepositoryNotFoundError,
  WalletRepository,
} from "@/lib/db/repositories";
import type { CreateBudgetInput, CreateWalletInput } from "@/lib/db/validation";

export class ApplicationPermissionError extends Error {}
export class IdempotencyKeyRequiredError extends Error {}
export class IdempotencyRequestUnresolvedError extends Error {}

type MutationSource = "web" | "mcp" | "system";

function requireWriteRole(context: AuthContext) {
  if (context.role === "viewer") {
    throw new ApplicationPermissionError("Viewer role cannot modify workspace data");
  }
}

function normalizeIdempotencyKey(value: string) {
  const key = value.trim();
  if (!key) throw new IdempotencyKeyRequiredError("Idempotency-Key is required");
  if (key.length > 255) {
    throw new IdempotencyKeyRequiredError("Idempotency-Key must not exceed 255 characters");
  }
  return key;
}

export class WorkspaceApplicationService {
  private readonly wallets: WalletRepository;
  private readonly budgets: BudgetRepository;
  private readonly audits: AuditRepository;
  private readonly idempotency: IdempotencyRepository;

  constructor(private readonly database: AppDatabase) {
    this.wallets = new WalletRepository(database);
    this.budgets = new BudgetRepository(database);
    this.audits = new AuditRepository(database);
    this.idempotency = new IdempotencyRepository(database);
  }

  listWallets(context: AuthContext) {
    return this.wallets.list(context);
  }

  async createWallet(
    context: AuthContext,
    input: CreateWalletInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const claim = await this.idempotency.claim(context, {
      operation: "wallet.create",
      key,
      request: input,
    });
    if (claim.state === "completed") {
      const walletId = claim.record.response?.walletId;
      if (typeof walletId !== "string") {
        throw new RepositoryNotFoundError("Stored wallet response is invalid");
      }
      const wallet = await this.wallets.getById(context, walletId);
      if (!wallet) throw new RepositoryNotFoundError("Stored wallet no longer exists");
      return { wallet, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const wallet = await this.database.transaction(async (transaction) => {
        const wallets = new WalletRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const created = await wallets.create(context, input);
        await audits.record(context, {
          actorUserId: context.userId,
          action: "wallet.created",
          entityType: "wallet",
          entityId: created.id,
          source,
          idempotencyKey: key,
          payload: {
            address: created.normalizedAddress,
            chainId: created.chainId,
            source: created.source,
          },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { walletId: created.id },
        });
        return created;
      });
      return { wallet, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  listBudgets(context: AuthContext) {
    return this.budgets.list(context);
  }

  async setPrimaryWallet(context: AuthContext, walletId: string, source: MutationSource = "web") {
    requireWriteRole(context);
    return this.database.transaction(async (transaction) => {
      const wallets = new WalletRepository(transaction);
      const audits = new AuditRepository(transaction);
      const wallet = await wallets.setPrimary(context, walletId);
      await audits.record(context, {
        actorUserId: context.userId,
        action: "wallet.primary_set",
        entityType: "wallet",
        entityId: wallet.id,
        source,
        payload: { address: wallet.normalizedAddress, chainId: wallet.chainId },
      });
      return wallet;
    });
  }

  async createBudget(
    context: AuthContext,
    input: CreateBudgetInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const effectiveInput = { ...input, createdBy: context.userId };
    const claim = await this.idempotency.claim(context, {
      operation: "budget.create",
      key,
      request: effectiveInput,
    });
    if (claim.state === "completed") {
      const budgetId = claim.record.response?.budgetId;
      const budget = (await this.budgets.list(context)).find((item) => item.id === budgetId);
      if (!budget) throw new RepositoryNotFoundError("Stored budget no longer exists");
      return { budget, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const budget = await this.database.transaction(async (transaction) => {
        const budgets = new BudgetRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const created = await budgets.create(context, effectiveInput);
        await audits.record(context, {
          actorUserId: context.userId,
          action: "budget.created",
          entityType: "budget",
          entityId: created.id,
          source,
          idempotencyKey: key,
          payload: { amount: created.amount, periodType: created.periodType },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { budgetId: created.id },
        });
        return created;
      });
      return { budget, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async updateBudgetAmount(
    context: AuthContext,
    input: { budgetId: string; expectedVersion: number; amount: string },
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.database.transaction(async (transaction) => {
      const budgets = new BudgetRepository(transaction);
      const audits = new AuditRepository(transaction);
      const budget = await budgets.updateAmount(context, input);
      await audits.record(context, {
        actorUserId: context.userId,
        action: "budget.amount_updated",
        entityType: "budget",
        entityId: budget.id,
        source,
        payload: { amount: budget.amount, version: budget.version },
      });
      return budget;
    });
  }
}
