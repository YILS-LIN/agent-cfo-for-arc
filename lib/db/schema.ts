import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "operator", "viewer"]);
export const walletSourceEnum = pgEnum("wallet_source", [
  "manual",
  "metamask",
  "circle_user_controlled",
  "circle_agent",
  "external",
]);
export const ownershipStatusEnum = pgEnum("ownership_status", [
  "unverified",
  "verified",
  "managed",
]);
export const syncStatusEnum = pgEnum("sync_status", [
  "idle",
  "syncing",
  "ready",
  "partial",
  "failed",
]);
export const paymentSourceEnum = pgEnum("payment_source", [
  "arc",
  "circle_gateway",
  "x402",
  "demo",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
]);
export const budgetPeriodEnum = pgEnum("budget_period", [
  "task",
  "daily",
  "weekly",
  "monthly",
  "custom",
]);
export const budgetStatusEnum = pgEnum("budget_status", ["active", "paused", "archived"]);
export const auditSourceEnum = pgEnum("audit_source", ["web", "mcp", "system"]);
export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "processing",
  "completed",
  "failed",
]);
export const riskSeverityEnum = pgEnum("risk_severity", ["low", "medium", "high"]);
export const riskStatusEnum = pgEnum("risk_status", ["open", "investigating", "resolved"]);
export const reportStatusEnum = pgEnum("report_status", ["pending", "completed", "failed"]);
export const providerPolicyDecisionEnum = pgEnum("provider_policy_decision", [
  "allowed",
  "review",
  "blocked",
]);
export const credentialStatusEnum = pgEnum("credential_status", ["unverified", "valid", "invalid"]);

export type WalletCapabilities = {
  observable: boolean;
  ownershipVerified: boolean;
  userSignable: boolean;
  agentExecutable: boolean;
  policyEnforceable: boolean;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const identityAccounts = pgTable(
  "identity_accounts",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    walletAddress: text("wallet_address"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identity_provider_subject_unique").on(table.provider, table.providerSubject),
    index("identity_user_idx").on(table.userId),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("workspace_owner_idx").on(table.ownerId)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_member_user_idx").on(table.userId),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    normalizedAddress: text("normalized_address").notNull(),
    chainId: integer("chain_id").notNull(),
    source: walletSourceEnum("source").notNull(),
    label: text("label").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    ownershipStatus: ownershipStatusEnum("ownership_status").notNull().default("unverified"),
    capabilities: jsonb("capabilities").$type<WalletCapabilities>().notNull(),
    externalProvider: text("external_provider"),
    externalWalletId: text("external_wallet_id"),
    syncStatus: syncStatusEnum("sync_status").notNull().default("idle"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wallet_workspace_chain_address_unique").on(
      table.workspaceId,
      table.chainId,
      table.normalizedAddress,
    ),
    uniqueIndex("wallet_workspace_id_unique").on(table.workspaceId, table.id),
    index("wallet_workspace_idx").on(table.workspaceId),
    check(
      "wallet_normalized_address_lowercase",
      sql`${table.normalizedAddress} = lower(${table.normalizedAddress})`,
    ),
  ],
);

export const chainEvents = pgTable(
  "chain_events",
  {
    id: uuid("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockHash: text("block_hash"),
    contractAddress: text("contract_address").notNull(),
    eventName: text("event_name").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chain_event_identity_unique").on(
      table.chainId,
      table.transactionHash,
      table.eventIndex,
    ),
    index("chain_event_block_idx").on(table.chainId, table.blockNumber),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    externalKey: text("external_key"),
    name: text("name").notNull(),
    status: taskStatusEnum("status").notNull().default("pending"),
    version: integer("version").notNull().default(1),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("task_workspace_external_key_unique").on(table.workspaceId, table.externalKey),
    uniqueIndex("task_workspace_id_unique").on(table.workspaceId, table.id),
    index("task_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "task_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    chainEventId: uuid("chain_event_id").references(() => chainEvents.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    transactionHash: text("transaction_hash"),
    amount: numeric("amount", { precision: 38, scale: 6 }).notNull(),
    currency: text("currency").notNull().default("USDC"),
    providerId: text("provider_id"),
    providerName: text("provider_name"),
    category: text("category"),
    resourceUri: text("resource_uri"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    source: paymentSourceEnum("source").notNull(),
    rawReference: text("raw_reference"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_workspace_source_external_unique").on(
      table.workspaceId,
      table.source,
      table.externalId,
    ),
    index("payment_workspace_occurred_idx").on(table.workspaceId, table.occurredAt),
    index("payment_wallet_occurred_idx").on(table.walletId, table.occurredAt),
    index("payment_task_idx").on(table.taskId),
    check("payment_amount_positive", sql`${table.amount} > 0`),
    check("payment_currency_usdc", sql`${table.currency} = 'USDC'`),
    foreignKey({
      name: "payment_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "payment_workspace_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id"),
    taskId: uuid("task_id"),
    providerId: text("provider_id"),
    periodType: budgetPeriodEnum("period_type").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 38, scale: 6 }).notNull(),
    currency: text("currency").notNull().default("USDC"),
    warningThreshold: numeric("warning_threshold", { precision: 5, scale: 2 })
      .notNull()
      .default("80"),
    hardLimitRequested: boolean("hard_limit_requested").notNull().default(false),
    status: budgetStatusEnum("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("budget_workspace_period_idx").on(table.workspaceId, table.periodStart, table.periodEnd),
    check("budget_amount_positive", sql`${table.amount} > 0`),
    check("budget_period_valid", sql`${table.periodEnd} > ${table.periodStart}`),
    check(
      "budget_warning_threshold_valid",
      sql`${table.warningThreshold} > 0 and ${table.warningThreshold} <= 100`,
    ),
    foreignKey({
      name: "budget_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "budget_workspace_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
  ],
);

export type BudgetRevisionSnapshot = {
  walletId: string | null;
  taskId: string | null;
  providerId: string | null;
  periodType: "task" | "daily" | "weekly" | "monthly" | "custom";
  periodStart: string;
  periodEnd: string;
  amount: string;
  warningThreshold: string;
  hardLimitRequested: boolean;
  status: "active" | "paused" | "archived";
};

export const budgetRevisions = pgTable(
  "budget_revisions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    action: text("action").notNull(),
    snapshot: jsonb("snapshot").$type<BudgetRevisionSnapshot>().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    source: auditSourceEnum("source").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("budget_revision_budget_version_unique").on(table.budgetId, table.version),
    index("budget_revision_workspace_budget_idx").on(table.workspaceId, table.budgetId),
  ],
);

export const providerPolicies = pgTable(
  "provider_policies",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerKey: text("provider_key").notNull(),
    displayName: text("display_name").notNull(),
    decision: providerPolicyDecisionEnum("decision").notNull().default("review"),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("provider_policy_workspace_key_unique").on(table.workspaceId, table.providerKey),
    index("provider_policy_workspace_decision_idx").on(table.workspaceId, table.decision),
  ],
);

export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    encryptedSecret: text("encrypted_secret").notNull(),
    encryptionIv: text("encryption_iv").notNull(),
    encryptionAuthTag: text("encryption_auth_tag").notNull(),
    encryptionKeyId: text("encryption_key_id").notNull(),
    secretHint: text("secret_hint").notNull(),
    status: credentialStatusEnum("status").notNull().default("unverified"),
    version: integer("version").notNull().default(1),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_credential_workspace_provider_unique").on(table.workspaceId, table.provider),
    index("ai_credential_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const analysisSnapshots = pgTable(
  "analysis_snapshots",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id"),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    version: text("version").notNull(),
    inputHash: text("input_hash").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("analysis_workspace_input_version_unique").on(
      table.workspaceId,
      table.inputHash,
      table.version,
    ),
    uniqueIndex("analysis_workspace_id_unique").on(table.workspaceId, table.id),
    index("analysis_workspace_calculated_idx").on(table.workspaceId, table.calculatedAt),
    check("analysis_range_valid", sql`${table.rangeEnd} >= ${table.rangeStart}`),
    foreignKey({
      name: "analysis_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }).onDelete("cascade"),
  ],
);

export const riskSignals = pgTable(
  "risk_signals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    analysisSnapshotId: uuid("analysis_snapshot_id").references(() => analysisSnapshots.id, {
      onDelete: "set null",
    }),
    ruleId: text("rule_id").notNull(),
    severity: riskSeverityEnum("severity").notNull(),
    status: riskStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    version: integer("version").notNull().default(1),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("risk_workspace_status_idx").on(table.workspaceId, table.status, table.detectedAt),
    index("risk_wallet_idx").on(table.walletId),
    uniqueIndex("risk_workspace_rule_unique").on(table.workspaceId, table.ruleId),
    foreignKey({
      name: "risk_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "risk_workspace_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      name: "risk_workspace_analysis_fk",
      columns: [table.workspaceId, table.analysisSnapshotId],
      foreignColumns: [analysisSnapshots.workspaceId, analysisSnapshots.id],
    }),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    analysisSnapshotId: uuid("analysis_snapshot_id").references(() => analysisSnapshots.id, {
      onDelete: "set null",
    }),
    status: reportStatusEnum("status").notNull().default("pending"),
    title: text("title").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>(),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    errorCode: text("error_code"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("report_workspace_created_idx").on(table.workspaceId, table.createdAt),
    foreignKey({
      name: "report_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }),
    foreignKey({
      name: "report_workspace_task_fk",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }),
    foreignKey({
      name: "report_workspace_analysis_fk",
      columns: [table.workspaceId, table.analysisSnapshotId],
      foreignColumns: [analysisSnapshots.workspaceId, analysisSnapshots.id],
    }),
  ],
);

export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id").notNull(),
    source: paymentSourceEnum("source").notNull(),
    cursor: text("cursor"),
    status: syncStatusEnum("status").notNull().default("idle"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sync_cursor_wallet_source_unique").on(table.walletId, table.source),
    index("sync_cursor_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "sync_cursor_workspace_wallet_fk",
      columns: [table.workspaceId, table.walletId],
      foreignColumns: [wallets.workspaceId, wallets.id],
    }).onDelete("cascade"),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    source: auditSourceEnum("source").notNull(),
    idempotencyKey: text("idempotency_key"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: idempotencyStatusEnum("status").notNull().default("processing"),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_workspace_operation_key_unique").on(
      table.workspaceId,
      table.operation,
      table.key,
    ),
    index("idempotency_expiry_idx").on(table.expiresAt),
  ],
);

export const rateLimitCounters = pgTable(
  "rate_limit_counters",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash, table.windowStart] }),
    index("rate_limit_expiry_idx").on(table.expiresAt),
    check("rate_limit_count_positive", sql`${table.count} > 0`),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  identities: many(identityAccounts),
  memberships: many(workspaceMembers),
  ownedWorkspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  wallets: many(wallets),
  tasks: many(tasks),
  payments: many(paymentEvents),
  budgets: many(budgets),
  budgetRevisions: many(budgetRevisions),
  analyses: many(analysisSnapshots),
  risks: many(riskSignals),
  reports: many(reports),
}));

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [wallets.workspaceId], references: [workspaces.id] }),
  payments: many(paymentEvents),
  tasks: many(tasks),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [paymentEvents.workspaceId],
    references: [workspaces.id],
  }),
  wallet: one(wallets, { fields: [paymentEvents.walletId], references: [wallets.id] }),
  task: one(tasks, { fields: [paymentEvents.taskId], references: [tasks.id] }),
  chainEvent: one(chainEvents, {
    fields: [paymentEvents.chainEventId],
    references: [chainEvents.id],
  }),
}));
