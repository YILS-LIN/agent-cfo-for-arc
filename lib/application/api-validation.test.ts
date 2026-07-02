import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createBudgetRequestSchema,
  ingestPaymentRequestSchema,
} from "@/lib/application/api-validation";

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

describe("payment API validation", () => {
  it("accepts the documented gateway payment source as the Circle Gateway source", () => {
    const result = ingestPaymentRequestSchema.parse({
      walletId: randomUUID(),
      externalId: "gateway-settlement-1",
      transactionHash: `0x${"1".repeat(64)}`,
      amount: "0.01",
      providerName: "Gateway API",
      resourceUri: "/hello-world",
      occurredAt: "2026-06-20T00:00:00.000Z",
      source: "gateway",
      rawReference: "circle-transfer-1",
      metadata: { settlementStatus: "completed" },
    });

    expect(result.source).toBe("circle_gateway");
    expect(result.occurredAt).toBeInstanceOf(Date);
  });
});
