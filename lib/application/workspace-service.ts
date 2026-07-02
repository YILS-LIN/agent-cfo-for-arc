import type { AuthContext } from "@/lib/auth/types";
import {
  buildRiskAnalysisInputHash,
  evaluatePersistentRisks,
} from "@/lib/analytics/persistent-risk";
import { buildPersistentDashboard } from "@/lib/analytics/persistent-dashboard";
import { buildPersistentWorkspaceSummary } from "@/lib/analytics/persistent-summary";
import type { AppDatabase } from "@/lib/db/database";
import {
  AnalysisRepository,
  AuditRepository,
  BudgetConflictError,
  BudgetRevisionRepository,
  BudgetRepository,
  IdempotencyRepository,
  PaymentRepository,
  ProviderPolicyRepository,
  RepositoryNotFoundError,
  RiskRepository,
  TaskRepository,
  TransactionIntentRepository,
  WalletRepository,
} from "@/lib/db/repositories";
import type {
  ApproveTransactionIntentInput,
  CreateBudgetInput,
  CreateTaskInput,
  CreateTransactionIntentInput,
  CreateWalletInput,
  IngestPaymentInput,
  SubmitTransactionIntentInput,
  UpdateBudgetInput,
  UpdateTaskStatusInput,
} from "@/lib/db/validation";
import {
  approveTransactionIntentInputSchema,
  createTransactionIntentInputSchema,
  ingestPaymentInputSchema,
  submitTransactionIntentInputSchema,
} from "@/lib/db/validation";

export class ApplicationPermissionError extends Error {}
export class IdempotencyKeyRequiredError extends Error {}
export class IdempotencyRequestUnresolvedError extends Error {}
export class AnalysisLimitExceededError extends Error {}

type MutationSource = "web" | "mcp" | "system";

function mutationActor(context: AuthContext, source: MutationSource) {
  return source === "system" ? undefined : context.userId;
}

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

function previousRange(input: { rangeStart: Date; rangeEnd: Date }) {
  const duration = input.rangeEnd.getTime() - input.rangeStart.getTime();
  return {
    from: new Date(input.rangeStart.getTime() - duration),
    to: input.rangeStart,
  };
}

export class WorkspaceApplicationService {
  private readonly wallets: WalletRepository;
  private readonly budgets: BudgetRepository;
  private readonly budgetRevisions: BudgetRevisionRepository;
  private readonly audits: AuditRepository;
  private readonly idempotency: IdempotencyRepository;
  private readonly tasks: TaskRepository;
  private readonly payments: PaymentRepository;
  private readonly risks: RiskRepository;
  private readonly providerPolicies: ProviderPolicyRepository;

  constructor(private readonly database: AppDatabase) {
    this.wallets = new WalletRepository(database);
    this.budgets = new BudgetRepository(database);
    this.budgetRevisions = new BudgetRevisionRepository(database);
    this.audits = new AuditRepository(database);
    this.idempotency = new IdempotencyRepository(database);
    this.tasks = new TaskRepository(database);
    this.payments = new PaymentRepository(database);
    this.risks = new RiskRepository(database);
    this.providerPolicies = new ProviderPolicyRepository(database);
  }

  private async runIdempotentUpdate<T>(
    context: AuthContext,
    input: {
      operation: string;
      idempotencyKey: string;
      request: Record<string, unknown>;
      load: (entityId: string) => Promise<T | null>;
      mutate: (database: AppDatabase, key: string) => Promise<T & { id: string }>;
    },
  ) {
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const claim = await this.idempotency.claim(context, {
      operation: input.operation,
      key,
      request: input.request,
    });
    if (claim.state === "completed") {
      const entityId = claim.record.response?.entityId;
      if (typeof entityId !== "string") {
        throw new RepositoryNotFoundError("Stored mutation response is invalid");
      }
      const entity = await input.load(entityId);
      if (!entity) throw new RepositoryNotFoundError("Stored mutation entity no longer exists");
      return entity;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }
    try {
      return await this.database.transaction(async (transaction) => {
        const entity = await input.mutate(transaction, key);
        await new IdempotencyRepository(transaction).complete(context, {
          id: claim.record.id,
          response: { entityId: entity.id },
        });
        return entity;
      });
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  listWallets(context: AuthContext) {
    return this.wallets.list(context);
  }

  async createTransactionIntent(
    context: AuthContext,
    input: CreateTransactionIntentInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const normalizedInput = createTransactionIntentInputSchema.parse(input);
    const wallet = await this.wallets.getById(context, normalizedInput.walletId);
    if (!wallet) throw new RepositoryNotFoundError("Workspace wallet not found");
    if (wallet.archivedAt) throw new RepositoryNotFoundError("Active workspace wallet not found");
    if (!wallet.capabilities.agentExecutable) {
      throw new ApplicationPermissionError(
        "Wallet does not have agent execution capability for transaction intents",
      );
    }
    if (wallet.chainId !== normalizedInput.chainId) {
      throw new ApplicationPermissionError("Transaction intent chain must match the wallet chain");
    }
    const budget = await this.budgets.getById(context, normalizedInput.budgetId);
    if (!budget) throw new RepositoryNotFoundError("Workspace budget not found");
    if (budget.status !== "active") {
      throw new BudgetConflictError("Transaction intents require an active budget");
    }
    if (budget.walletId && budget.walletId !== wallet.id) {
      throw new BudgetConflictError("Transaction intent budget does not cover this wallet");
    }
    if (budget.taskId && budget.taskId !== normalizedInput.taskId) {
      throw new BudgetConflictError("Transaction intent budget does not cover this task");
    }

    const request = { ...normalizedInput, createdBy: mutationActor(context, source) };
    const claim = await this.idempotency.claim(context, {
      operation: "transaction_intent.create",
      key,
      request,
    });
    if (claim.state === "completed") {
      const entityId = claim.record.response?.entityId;
      if (typeof entityId !== "string") {
        throw new RepositoryNotFoundError("Stored transaction intent response is invalid");
      }
      const intent = await new TransactionIntentRepository(this.database).getById(context, entityId);
      if (!intent) throw new RepositoryNotFoundError("Stored transaction intent no longer exists");
      return { intent, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const intent = await this.database.transaction(async (transaction) => {
        const intents = new TransactionIntentRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const created = await intents.create(context, request);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "transaction_intent.created",
          entityType: "transaction_intent",
          entityId: created.id,
          source,
          idempotencyKey: key,
          payload: {
            walletId: created.walletId,
            budgetId: created.budgetId,
            amount: created.amount,
            status: created.status,
          },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { entityId: created.id },
        });
        return created;
      });
      return { intent, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async approveTransactionIntent(
    context: AuthContext,
    input: ApproveTransactionIntentInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const normalizedInput = approveTransactionIntentInputSchema.parse(input);
    const claim = await this.idempotency.claim(context, {
      operation: "transaction_intent.approve",
      key,
      request: normalizedInput,
    });
    if (claim.state === "completed") {
      const entityId = claim.record.response?.entityId;
      if (typeof entityId !== "string") {
        throw new RepositoryNotFoundError("Stored transaction intent response is invalid");
      }
      const intent = await new TransactionIntentRepository(this.database).getById(context, entityId);
      if (!intent) throw new RepositoryNotFoundError("Stored transaction intent no longer exists");
      return { intent, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const intent = await this.database.transaction(async (transaction) => {
        const intents = new TransactionIntentRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const approved = await intents.approve(context, normalizedInput);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "transaction_intent.approved",
          entityType: "transaction_intent",
          entityId: approved.id,
          source,
          idempotencyKey: key,
          payload: {
            walletId: approved.walletId,
            budgetId: approved.budgetId,
            status: approved.status,
          },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { entityId: approved.id },
        });
        return approved;
      });
      return { intent, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async submitTransactionIntent(
    context: AuthContext,
    input: SubmitTransactionIntentInput,
    idempotencyKey: string,
    source: MutationSource = "system",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const normalizedInput = submitTransactionIntentInputSchema.parse(input);
    const claim = await this.idempotency.claim(context, {
      operation: "transaction_intent.submit",
      key,
      request: normalizedInput,
    });
    if (claim.state === "completed") {
      const entityId = claim.record.response?.entityId;
      if (typeof entityId !== "string") {
        throw new RepositoryNotFoundError("Stored transaction intent response is invalid");
      }
      const intent = await new TransactionIntentRepository(this.database).getById(context, entityId);
      if (!intent) throw new RepositoryNotFoundError("Stored transaction intent no longer exists");
      return { intent, replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }

    try {
      const intent = await this.database.transaction(async (transaction) => {
        const intents = new TransactionIntentRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const submitted = await intents.submit(context, normalizedInput);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "transaction_intent.submitted",
          entityType: "transaction_intent",
          entityId: submitted.id,
          source,
          idempotencyKey: key,
          payload: {
            walletId: submitted.walletId,
            budgetId: submitted.budgetId,
            status: submitted.status,
            transactionHash: submitted.transactionHash,
          },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { entityId: submitted.id },
        });
        return submitted;
      });
      return { intent, replayed: false } as const;
    } catch (error) {
      await this.idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async getWallet(context: AuthContext, walletId: string) {
    const wallet = await this.wallets.getById(context, walletId);
    if (!wallet) throw new RepositoryNotFoundError("Workspace wallet not found");
    return wallet;
  }

  async createWallet(
    context: AuthContext,
    input: CreateWalletInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const normalizedAddress = input.address.toLowerCase();
    const linkedWallet = context.identities.find(
      (identity) =>
        identity.type === "wallet" && identity.address?.toLowerCase() === normalizedAddress,
    );
    if (input.source === "metamask" && !linkedWallet) {
      throw new ApplicationPermissionError(
        "MetaMask ownership requires the same wallet to be linked to the current sign-in session",
      );
    }
    if (input.source !== "manual" && input.source !== "external" && input.source !== "metamask") {
      throw new ApplicationPermissionError(
        "Circle wallet sources can only be created by a verified provider adapter",
      );
    }
    const ownershipVerified = input.source === "metamask" && Boolean(linkedWallet);
    const effectiveInput: CreateWalletInput = {
      ...input,
      source: ownershipVerified ? "metamask" : input.source,
      ownershipStatus: ownershipVerified ? "verified" : "unverified",
      capabilities: {
        observable: true,
        ownershipVerified,
        userSignable: ownershipVerified,
        agentExecutable: false,
        policyEnforceable: false,
      },
      externalProvider: input.source === "external" ? input.externalProvider : undefined,
      externalWalletId: input.source === "external" ? input.externalWalletId : undefined,
    };
    const claim = await this.idempotency.claim(context, {
      operation: "wallet.create",
      key,
      request: effectiveInput,
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
        const created = await wallets.create(context, effectiveInput);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
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

  async getBudget(context: AuthContext, budgetId: string) {
    const budget = await this.budgets.getById(context, budgetId);
    if (!budget) throw new RepositoryNotFoundError("Workspace budget not found");
    return { budget, revisions: await this.budgetRevisions.list(context, budgetId) };
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

  listProviderPolicies(context: AuthContext) {
    return this.providerPolicies.list(context);
  }

  async setProviderPolicy(
    context: AuthContext,
    input: {
      providerKey: string;
      displayName: string;
      decision: "allowed" | "review" | "blocked";
      expectedVersion: number;
    },
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.runIdempotentUpdate(context, {
      operation: "provider.policy.set",
      idempotencyKey,
      request: input,
      load: (policyId) => this.providerPolicies.getById(context, policyId),
      mutate: async (transaction, key) => {
        const policies = new ProviderPolicyRepository(transaction);
        const audits = new AuditRepository(transaction);
        const policy = await policies.set(context, { ...input, updatedBy: context.userId });
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "provider.policy_updated",
          entityType: "provider_policy",
          entityId: policy.id,
          source,
          idempotencyKey: key,
          payload: {
            providerKey: policy.providerKey,
            decision: policy.decision,
            version: policy.version,
          },
        });
        return policy;
      },
    });
  }

  listRisks(
    context: AuthContext,
    filters: {
      status?: "open" | "investigating" | "resolved";
      severity?: "low" | "medium" | "high";
    } = {},
  ) {
    return this.risks.list(context, filters);
  }

  async getWorkspaceSummary(context: AuthContext, input: { rangeStart: Date; rangeEnd: Date }) {
    if (input.rangeEnd <= input.rangeStart) {
      throw new AnalysisLimitExceededError("Summary range end must be after its start");
    }
    if (input.rangeEnd.getTime() - input.rangeStart.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new AnalysisLimitExceededError("Summary range cannot exceed 366 days");
    }
    const [payments, previousPayments, budgets, wallets, tasks, risks] = await Promise.all([
      this.payments.listForAnalysis(context, { from: input.rangeStart, to: input.rangeEnd }),
      this.payments.listForAnalysis(context, previousRange(input)),
      this.budgets.list(context),
      this.wallets.list(context, { includeArchived: true }),
      this.tasks.list(context),
      this.risks.list(context),
    ]);
    if (payments.length > 10_000 || previousPayments.length > 10_000) {
      throw new AnalysisLimitExceededError(
        "Summary exceeds 10,000 payments; use a shorter date range",
      );
    }
    return buildPersistentWorkspaceSummary({
      ...input,
      payments,
      previousPayments,
      budgets,
      wallets,
      tasks,
      risks,
    });
  }

  async getWalletSummary(
    context: AuthContext,
    input: { walletId: string; rangeStart: Date; rangeEnd: Date },
  ) {
    if (input.rangeEnd <= input.rangeStart) {
      throw new AnalysisLimitExceededError("Summary range end must be after its start");
    }
    if (input.rangeEnd.getTime() - input.rangeStart.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new AnalysisLimitExceededError("Summary range cannot exceed 366 days");
    }
    const wallet = await this.getWallet(context, input.walletId);
    const [payments, previousPayments, allBudgets, allTasks, providerPolicies] = await Promise.all([
      this.payments.listForAnalysis(context, {
        from: input.rangeStart,
        to: input.rangeEnd,
        walletId: wallet.id,
      }),
      this.payments.listForAnalysis(context, { ...previousRange(input), walletId: wallet.id }),
      this.budgets.list(context),
      this.tasks.list(context),
      this.providerPolicies.list(context),
    ]);
    if (payments.length > 10_000 || previousPayments.length > 10_000) {
      throw new AnalysisLimitExceededError(
        "Wallet summary exceeds 10,000 payments; use a shorter date range",
      );
    }
    const paymentTaskIds = new Set(
      payments.flatMap((payment) => (payment.taskId ? [payment.taskId] : [])),
    );
    const budgets = allBudgets.filter(
      (budget) => !budget.walletId || budget.walletId === wallet.id,
    );
    const tasks = allTasks.filter(
      (task) => task.walletId === wallet.id || paymentTaskIds.has(task.id),
    );
    const riskRules = evaluatePersistentRisks({ payments, budgets, providerPolicies });
    return {
      wallet,
      risks: riskRules,
      summary: buildPersistentWorkspaceSummary({
        rangeStart: input.rangeStart,
        rangeEnd: input.rangeEnd,
        payments,
        previousPayments,
        budgets,
        wallets: [wallet],
        tasks,
        risks: riskRules.map((risk) => ({ severity: risk.severity, status: "open" })),
      }),
    };
  }

  async getWorkspaceDashboard(context: AuthContext, input: { rangeStart: Date; rangeEnd: Date }) {
    if (input.rangeEnd <= input.rangeStart) {
      throw new AnalysisLimitExceededError("Dashboard range end must be after its start");
    }
    if (input.rangeEnd.getTime() - input.rangeStart.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new AnalysisLimitExceededError("Dashboard range cannot exceed 366 days");
    }
    const [payments, previousPayments, budgets, wallets, tasks, risks] = await Promise.all([
      this.payments.listForAnalysis(context, { from: input.rangeStart, to: input.rangeEnd }),
      this.payments.listForAnalysis(context, previousRange(input)),
      this.budgets.list(context),
      this.wallets.list(context, { includeArchived: true }),
      this.tasks.list(context),
      this.risks.list(context),
    ]);
    if (payments.length > 10_000 || previousPayments.length > 10_000) {
      throw new AnalysisLimitExceededError(
        "Dashboard exceeds 10,000 payments; use a shorter date range",
      );
    }
    const summary = buildPersistentWorkspaceSummary({
      ...input,
      payments,
      previousPayments,
      budgets,
      wallets,
      tasks,
      risks,
    });
    return buildPersistentDashboard({
      calculatedAt: new Date(),
      summary,
      payments,
      wallets,
      tasks,
      risks,
    });
  }

  async analyzeRisks(
    context: AuthContext,
    input: { rangeStart: Date; rangeEnd: Date },
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    if (input.rangeEnd <= input.rangeStart) throw new Error("Risk analysis range is invalid");
    if (input.rangeEnd.getTime() - input.rangeStart.getTime() > 366 * 24 * 60 * 60 * 1_000) {
      throw new AnalysisLimitExceededError("Risk analysis range cannot exceed 366 days");
    }
    const [payments, budgets, providerPolicies] = await Promise.all([
      this.payments.listForAnalysis(context, { from: input.rangeStart, to: input.rangeEnd }),
      this.budgets.list(context),
      this.providerPolicies.list(context),
    ]);
    if (payments.length > 10_000) {
      throw new AnalysisLimitExceededError(
        "Risk analysis exceeds 10,000 payments; use a shorter date range",
      );
    }
    const riskInput = { payments, budgets, providerPolicies };
    const rules = evaluatePersistentRisks(riskInput);
    const inputHash = buildRiskAnalysisInputHash({ ...input, ...riskInput });
    const result = {
      paymentCount: payments.length,
      budgetCount: budgets.length,
      ruleCount: rules.length,
      ruleIds: rules.map((rule) => rule.ruleId),
    };

    return this.database.transaction(async (transaction) => {
      const analyses = new AnalysisRepository(transaction);
      const risks = new RiskRepository(transaction);
      const audits = new AuditRepository(transaction);
      const analysis = await analyses.createOrGet(context, {
        ...input,
        version: "risk-v2",
        inputHash,
        result,
      });
      if (!analysis.created) {
        const currentRuleIds = new Set(rules.map((rule) => rule.ruleId));
        const signals = (await risks.list(context)).filter((risk) =>
          currentRuleIds.has(risk.ruleId),
        );
        return {
          snapshot: analysis.snapshot,
          signals,
          resolvedCount: 0,
          replayed: true,
        };
      }
      const signals = await risks.upsertForSnapshot(context, {
        analysisSnapshotId: analysis.snapshot.id,
        rules,
      });
      const resolved = await risks.resolveStale(
        context,
        rules.map((rule) => rule.ruleId),
      );
      if (analysis.created) {
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "risk.analysis_completed",
          entityType: "analysis_snapshot",
          entityId: analysis.snapshot.id,
          source,
          payload: result,
        });
      }
      return {
        snapshot: analysis.snapshot,
        signals,
        resolvedCount: resolved.length,
        replayed: false,
      };
    });
  }

  async updateRiskStatus(
    context: AuthContext,
    input: {
      riskId: string;
      expectedVersion: number;
      status: "open" | "investigating" | "resolved";
    },
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.runIdempotentUpdate(context, {
      operation: "risk.status.update",
      idempotencyKey,
      request: input,
      load: (riskId) => this.risks.getById(context, riskId),
      mutate: async (transaction, key) => {
        const risks = new RiskRepository(transaction);
        const audits = new AuditRepository(transaction);
        const risk = await risks.updateStatus(context, input);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "risk.status_updated",
          entityType: "risk_signal",
          entityId: risk.id,
          source,
          idempotencyKey: key,
          payload: { status: risk.status, version: risk.version },
        });
        return risk;
      },
    });
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
    if (wallet.archivedAt) throw new RepositoryNotFoundError("Active workspace wallet not found");
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
          actorUserId: mutationActor(context, source),
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
          actorUserId: mutationActor(context, source),
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
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.runIdempotentUpdate(context, {
      operation: "task.status.update",
      idempotencyKey,
      request: input,
      load: (taskId) => this.tasks.getById(context, taskId),
      mutate: async (transaction, key) => {
        const tasks = new TaskRepository(transaction);
        const audits = new AuditRepository(transaction);
        const task = await tasks.updateStatus(context, input);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "task.status_updated",
          entityType: "task",
          entityId: task.id,
          source,
          idempotencyKey: key,
          payload: { status: task.status, version: task.version },
        });
        return task;
      },
    });
  }

  async setPrimaryWallet(
    context: AuthContext,
    walletId: string,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.runIdempotentUpdate(context, {
      operation: "wallet.primary.set",
      idempotencyKey,
      request: { walletId },
      load: (entityId) => this.wallets.getById(context, entityId),
      mutate: async (transaction, key) => {
        const wallets = new WalletRepository(transaction);
        const audits = new AuditRepository(transaction);
        const wallet = await wallets.setPrimary(context, walletId);
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "wallet.primary_set",
          entityType: "wallet",
          entityId: wallet.id,
          source,
          idempotencyKey: key,
          payload: { address: wallet.normalizedAddress, chainId: wallet.chainId },
        });
        return wallet;
      },
    });
  }

  async archiveWallet(
    context: AuthContext,
    walletId: string,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    return this.runIdempotentUpdate(context, {
      operation: "wallet.archive",
      idempotencyKey,
      request: { walletId },
      load: (entityId) => this.wallets.getById(context, entityId),
      mutate: async (transaction, key) => {
        const wallets = new WalletRepository(transaction);
        const budgets = new BudgetRepository(transaction);
        const revisions = new BudgetRevisionRepository(transaction);
        const audits = new AuditRepository(transaction);
        const wallet = await wallets.archive(context, walletId);
        const dependentBudgets = (await budgets.list(context)).filter(
          (budget) => budget.walletId === walletId && budget.status !== "archived",
        );
        for (const budget of dependentBudgets) {
          const archivedBudget = await budgets.update(context, {
            budgetId: budget.id,
            expectedVersion: budget.version,
            status: "archived",
          });
          await revisions.record(context, archivedBudget, {
            action: "status_changed",
            actorUserId: mutationActor(context, source),
            source,
            idempotencyKey: key,
          });
          await audits.record(context, {
            actorUserId: mutationActor(context, source),
            action: "budget.status_changed",
            entityType: "budget",
            entityId: archivedBudget.id,
            source,
            idempotencyKey: key,
            payload: {
              status: "archived",
              version: archivedBudget.version,
              reason: "wallet_archived",
            },
          });
        }
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: "wallet.archived",
          entityType: "wallet",
          entityId: wallet.id,
          source,
          idempotencyKey: key,
          payload: {
            address: wallet.normalizedAddress,
            chainId: wallet.chainId,
            preservedPaymentFacts: true,
          },
        });
        return wallet;
      },
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
        const revisions = new BudgetRevisionRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const overlap = await budgets.findOverlap(context, effectiveInput);
        if (overlap) {
          throw new BudgetConflictError(
            "Budget period overlaps another active or paused budget at the same scope level",
          );
        }
        const created = await budgets.create(context, effectiveInput);
        await revisions.record(context, created, {
          action: "created",
          actorUserId: mutationActor(context, source),
          source,
          idempotencyKey: key,
        });
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
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

  async updateBudget(
    context: AuthContext,
    input: UpdateBudgetInput,
    idempotencyKey: string,
    source: MutationSource = "web",
  ) {
    requireWriteRole(context);
    const key = normalizeIdempotencyKey(idempotencyKey);
    const claim = await this.idempotency.claim(context, {
      operation: "budget.update",
      key,
      request: input,
    });
    if (claim.state === "completed") {
      const budgetId = claim.record.response?.budgetId;
      if (typeof budgetId !== "string")
        throw new RepositoryNotFoundError("Stored budget response is invalid");
      const budget = await this.budgets.getById(context, budgetId);
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
        const revisions = new BudgetRevisionRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const updated = await budgets.update(context, input);
        const action = input.status ? "status_changed" : "updated";
        await revisions.record(context, updated, {
          action,
          actorUserId: mutationActor(context, source),
          source,
          idempotencyKey: key,
        });
        await audits.record(context, {
          actorUserId: mutationActor(context, source),
          action: `budget.${action}`,
          entityType: "budget",
          entityId: updated.id,
          source,
          idempotencyKey: key,
          payload: { version: updated.version, status: updated.status, amount: updated.amount },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { budgetId: updated.id },
        });
        return updated;
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
}
