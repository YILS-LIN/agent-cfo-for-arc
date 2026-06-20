import { z } from "zod";

import { createBudgetInputSchema, createWalletInputSchema } from "@/lib/db/validation";

export const createWalletRequestSchema = createWalletInputSchema;

export const createBudgetRequestSchema = z
  .object({
    ...createBudgetInputSchema.shape,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((input) => input.periodEnd > input.periodStart, {
    message: "Budget period end must be after its start",
    path: ["periodEnd"],
  });

export const updateBudgetRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amount: createBudgetInputSchema.shape.amount,
});
