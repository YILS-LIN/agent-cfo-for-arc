import { z } from "zod";

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM wallet address");
const usdcAmount = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, "Invalid USDC amount")
  .refine((value) => Number(value) > 0, "USDC amount must be positive");

export const createWalletInputSchema = z.object({
  address: evmAddress,
  chainId: z.number().int().positive(),
  source: z.enum(["manual", "metamask", "circle_user_controlled", "circle_agent", "external"]),
  label: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().default(false),
  ownershipStatus: z.enum(["unverified", "verified", "managed"]).default("unverified"),
  capabilities: z.object({
    observable: z.boolean(),
    ownershipVerified: z.boolean(),
    userSignable: z.boolean(),
    agentExecutable: z.boolean(),
    policyEnforceable: z.boolean(),
  }),
  externalProvider: z.string().trim().min(1).max(120).optional(),
  externalWalletId: z.string().trim().min(1).max(240).optional(),
});

export const createTaskInputSchema = z.object({
  walletId: z.string().uuid().optional(),
  externalKey: z.string().trim().min(1).max(240).optional(),
  name: z.string().trim().min(1).max(200),
  status: z.enum(["pending", "running", "paused", "completed", "failed"]).default("pending"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateTaskStatusInputSchema = z.object({
  taskId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  status: z.enum(["pending", "running", "paused", "completed", "failed"]),
});

export const setProviderPolicyInputSchema = z.object({
  providerKey: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  decision: z.enum(["allowed", "review", "blocked"]),
  expectedVersion: z.number().int().nonnegative(),
  updatedBy: z.string().uuid(),
});

export const storeAiCredentialInputSchema = z.object({
  provider: z.literal("openai"),
  model: z.string().trim().min(1).max(120),
  encryptedSecret: z.string().min(1),
  encryptionIv: z.string().min(1),
  encryptionAuthTag: z.string().min(1),
  encryptionKeyId: z.string().trim().min(1).max(120),
  secretHint: z.string().min(1).max(32),
  expectedVersion: z.number().int().nonnegative(),
  actorUserId: z.string().uuid(),
});

export const ingestPaymentInputSchema = z.object({
  walletId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  chainEventId: z.string().uuid().optional(),
  externalId: z.string().trim().min(1).max(300),
  transactionHash: z.string().trim().max(100).optional(),
  amount: usdcAmount,
  providerId: z.string().trim().max(200).optional(),
  providerName: z.string().trim().max(200).optional(),
  category: z.string().trim().max(120).optional(),
  resourceUri: z.string().trim().max(2_000).optional(),
  occurredAt: z.date(),
  source: z.enum(["arc", "circle_gateway", "x402", "demo"]),
  rawReference: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const ingestChainEventInputSchema = z.object({
  chainId: z.number().int().positive(),
  transactionHash: z.string().regex(/^0x[0-9a-f]{64}$/i),
  eventIndex: z.number().int().nonnegative(),
  blockNumber: z.bigint().nonnegative(),
  blockHash: z
    .string()
    .regex(/^0x[0-9a-f]{64}$/i)
    .optional(),
  contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/i),
  eventName: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.date(),
});

export const createBudgetInputSchema = z
  .object({
    walletId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    providerId: z.string().trim().min(1).max(200).optional(),
    periodType: z.enum(["task", "daily", "weekly", "monthly", "custom"]),
    periodStart: z.date(),
    periodEnd: z.date(),
    amount: usdcAmount,
    warningThreshold: z.number().positive().max(100).default(80),
    hardLimitRequested: z.boolean().default(false),
    createdBy: z.string().uuid().optional(),
  })
  .refine((input) => input.periodEnd > input.periodStart, {
    message: "Budget period end must be after its start",
    path: ["periodEnd"],
  })
  .refine((input) => [input.walletId, input.taskId, input.providerId].filter(Boolean).length <= 1, {
    message: "A budget can target only one scope level",
    path: ["walletId"],
  });

export const updateBudgetInputSchema = z
  .object({
    budgetId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    amount: usdcAmount.optional(),
    warningThreshold: z.number().positive().max(100).optional(),
    periodStart: z.date().optional(),
    periodEnd: z.date().optional(),
    status: z.enum(["active", "paused", "archived"]).optional(),
  })
  .refine(
    (input) =>
      input.amount !== undefined ||
      input.warningThreshold !== undefined ||
      input.periodStart !== undefined ||
      input.periodEnd !== undefined ||
      input.status !== undefined,
    { message: "At least one budget field must be updated" },
  );

export type CreateWalletInput = z.input<typeof createWalletInputSchema>;
export type CreateTaskInput = z.input<typeof createTaskInputSchema>;
export type UpdateTaskStatusInput = z.input<typeof updateTaskStatusInputSchema>;
export type SetProviderPolicyInput = z.input<typeof setProviderPolicyInputSchema>;
export type StoreAiCredentialInput = z.input<typeof storeAiCredentialInputSchema>;
export type IngestPaymentInput = z.input<typeof ingestPaymentInputSchema>;
export type IngestChainEventInput = z.input<typeof ingestChainEventInputSchema>;
export type CreateBudgetInput = z.input<typeof createBudgetInputSchema>;
export type UpdateBudgetInput = z.input<typeof updateBudgetInputSchema>;
