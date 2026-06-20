import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createBudgetRequestSchema } from "@/lib/application/api-validation";

describe("budget API validation", () => {
  it("coerces dates and strips server-owned actor fields", () => {
    const result = createBudgetRequestSchema.parse({
      periodType: "daily",
      periodStart: "2026-06-20T00:00:00.000Z",
      periodEnd: "2026-06-21T00:00:00.000Z",
      amount: "10.5",
      warningThreshold: 80,
      hardLimitRequested: false,
      createdBy: randomUUID(),
    });

    expect(result.periodStart).toBeInstanceOf(Date);
    expect(result).not.toHaveProperty("createdBy");
  });

  it("rejects inverted budget periods", () => {
    expect(() =>
      createBudgetRequestSchema.parse({
        periodType: "custom",
        periodStart: "2026-06-21T00:00:00.000Z",
        periodEnd: "2026-06-20T00:00:00.000Z",
        amount: "1",
      }),
    ).toThrow();
  });
});
