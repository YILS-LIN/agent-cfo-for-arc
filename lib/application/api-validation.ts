import { z } from "zod";

import { createBudgetInputSchema, createWalletInputSchema } from "@/lib/db/validation";

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
