import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import {
  AuditRepository,
  BudgetRepository,
  IdempotencyRepository,
  PaymentRepository,
  RepositoryNotFoundError,
  TaskRepository,
  WalletRepository,
} from "@/lib/db/repositories";
import type {
  CreateBudgetInput,
  CreateTaskInput,
  CreateWalletInput,
  IngestPaymentInput,
  UpdateTaskStatusInput,
} from "@/lib/db/validation";
import { ingestPaymentInputSchema } from "@/lib/db/validation";

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
  private readonly tasks: TaskRepository;
  private readonly payments: PaymentRepository;

  constructor(private readonly database: AppDatabase) {
    this.wallets = new WalletRepository(database);
    this.budgets = new BudgetRepository(database);
    this.audits = new AuditRepository(database);
    this.idempotency = new IdempotencyRepository(database);
    this.tasks = new TaskRepository(database);
    this.payments = new PaymentRepository(database);
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

  listTasks(context: AuthContext) {
    return this.tasks.list(context);
  }

  listPayments(
    context: AuthContext,
    filters: { walletId?: string; from?: Date; to?: Date; limit?: number } = {},
  ) {
    return this.payments.list(context, filters);
  }

  async ingestPayment(
    context: AuthContext,
    input: IngestPaymentInput,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const normalizedInput = ingestPaymentInputSchema.parse(input);
    const wallet = await this.wallets.getById(context, normalizedInput.walletId);
    if (!wallet) throw new RepositoryNotFoundError("Workspace wallet not found");
    if (normalizedInput.taskId) {
      const task = await this.tasks.getById(context, normalizedInput.taskId);
      if (!task) throw new RepositoryNotFoundError("Workspace task not found");
    }
    return this.database.transaction(async (transaction) => {
      const payments = new PaymentRepository(transaction);
      const audits = new AuditRepository(transaction);
      const result = await payments.ingest(context, normalizedInput);
      if (result.created) {
        await audits.record(context, {
          actorUserId: context.userId,
          action: "payment.ingested",
          entityType: "payment",
          entityId: result.payment.id,
          source,
          payload: {
            paymentSource: result.payment.source,
            externalId: result.payment.externalId,
            walletId: result.payment.walletId,
            taskId: result.payment.taskId,
            amount: result.payment.amount,
          },
        });
      }
      return result;
    });
  }

  async createTask(
    context: AuthContext,
    input: CreateTaskInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const claim = await this.idempotency.claim(context, {
      operation: "task.create",
      key,
      request: input,
    });
    if (claim.state === "completed") {
      const taskId = claim.record.response?.taskId;
      if (typeof taskId !== "string")
        throw new RepositoryNotFoundError("Stored task response is invalid");
      const task = await this.tasks.getById(context, taskId);
      if (!task) throw new RepositoryNotFoundError("Stored task no longer exists");
      return { task, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const task = await this.database.transaction(async (transaction) => {
        const tasks = new TaskRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const created = await tasks.create(context, input);
        await audits.record(context, {
          actorUserId: context.userId,
          action: "task.created",
          entityType: "task",
          entityId: created.id,
          source,
          idempotencyKey: key,
          payload: { name: created.name, status: created.status, walletId: created.walletId },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { taskId: created.id },
        });
        return created;
      });
      return { task, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async updateTaskStatus(
    context: AuthContext,
    input: UpdateTaskStatusInput,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.database.transaction(async (transaction) => {
      const tasks = new TaskRepository(transaction);
      const audits = new AuditRepository(transaction);
      const task = await tasks.updateStatus(context, input);
      await audits.record(context, {
        actorUserId: context.userId,
        action: "task.status_updated",
        entityType: "task",
        entityId: task.id,
        source,
        payload: { status: task.status, version: task.version },
      });
      return task;
    });
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
