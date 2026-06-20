import { z } from "zod";

import {
  createBudgetInputSchema,
  createTaskInputSchema,
  createWalletInputSchema,
  ingestPaymentInputSchema,
  updateTaskStatusInputSchema,
} from "@/lib/db/validation";

export const createWalletRequestSchema = createWalletInputSchema;

export const createBudgetRequestSchema = z
  .object({
    walletId: createBudgetInputSchema.shape.walletId,
    taskId: createBudgetInputSchema.shape.taskId,
    providerId: createBudgetInputSchema.shape.providerId,
    periodType: createBudgetInputSchema.shape.periodType,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    amount: createBudgetInputSchema.shape.amount,
    warningThreshold: createBudgetInputSchema.shape.warningThreshold,
    hardLimitRequested: createBudgetInputSchema.shape.hardLimitRequested,
  })
  .refine((input) => input.periodEnd > input.periodStart, {
    message: "Budget period end must be after its start",
    path: ["periodEnd"],
  });

export const updateBudgetRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amount: createBudgetInputSchema.shape.amount,
});

export const updateWalletRequestSchema = z.object({
  isPrimary: z.literal(true),
});

export const createTaskRequestSchema = createTaskInputSchema;
export const updateTaskStatusRequestSchema = updateTaskStatusInputSchema.omit({ taskId: true });

export const ingestPaymentRequestSchema = z.object({
  walletId: ingestPaymentInputSchema.shape.walletId,
  taskId: ingestPaymentInputSchema.shape.taskId,
  chainEventId: ingestPaymentInputSchema.shape.chainEventId,
  externalId: ingestPaymentInputSchema.shape.externalId,
  transactionHash: ingestPaymentInputSchema.shape.transactionHash,
  amount: ingestPaymentInputSchema.shape.amount,
  providerId: ingestPaymentInputSchema.shape.providerId,
  providerName: ingestPaymentInputSchema.shape.providerName,
  category: ingestPaymentInputSchema.shape.category,
  resourceUri: ingestPaymentInputSchema.shape.resourceUri,
  occurredAt: z.coerce.date(),
  source: ingestPaymentInputSchema.shape.source,
  rawReference: ingestPaymentInputSchema.shape.rawReference,
  metadata: ingestPaymentInputSchema.shape.metadata,
});

export const listPaymentsQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(1_000).default(500),
});

export const analyzeRisksRequestSchema = z
  .object({
    rangeStart: z.coerce.date().optional(),
    rangeEnd: z.coerce.date().optional(),
  })
  .refine((input) => !input.rangeStart || !input.rangeEnd || input.rangeEnd > input.rangeStart, {
    message: "Risk analysis end must be after its start",
    path: ["rangeEnd"],
  });

export const listRisksQuerySchema = z.object({
  status: z.enum(["open", "investigating", "resolved"]).optional(),
  severity: z.enum(["low", "medium", "high"]).optional(),
});

export const updateRiskStatusRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["open", "investigating", "resolved"]),
});

export const syncWalletRequestSchema = z.object({
  source: z.enum(["arc", "circle_gateway", "x402"]),
});

export const internalPaymentIngestRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  payment: ingestPaymentRequestSchema,
});

export const workspaceSummaryQuerySchema = z
  .object({
    rangeStart: z.coerce.date().optional(),
    rangeEnd: z.coerce.date().optional(),
  })
  .refine((input) => !input.rangeStart || !input.rangeEnd || input.rangeEnd > input.rangeStart, {
    message: "Summary range end must be after its start",
    path: ["rangeEnd"],
  });

export const setProviderPolicyRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  decision: z.enum(["allowed", "review", "blocked"]),
  expectedVersion: z.number().int().nonnegative(),
});

export const storeAiCredentialRequestSchema = z.object({
  secret: z.string().trim().min(20).max(500),
  model: z.string().trim().min(1).max(120).optional(),
  expectedVersion: z.number().int().nonnegative(),
});

export const deleteAiCredentialQuerySchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});
