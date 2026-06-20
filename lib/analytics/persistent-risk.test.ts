import { describe, expect, it } from "vitest";

import {
  buildRiskAnalysisInputHash,
  evaluatePersistentRisks,
  type RiskPayment,
} from "@/lib/analytics/persistent-risk";

function payment(index: number, overrides: Partial<RiskPayment> = {}): RiskPayment {
  return {
    id: `payment-${index}`,
    walletId: "wallet-1",
    amount: "1",
    occurredAt: new Date(`2026-06-20T00:00:${String(index).padStart(2, "0")}.000Z`),
    ...overrides,
  };
}

describe("persistent risk rules", () => {
  it("uses exact USDC units for budget warning and exceeded signals", () => {
    const budget = {
      id: "budget-1",
      amount: "10",
      warningThreshold: "80.00",
      periodStart: new Date("2026-06-20T00:00:00.000Z"),
      periodEnd: new Date("2026-06-21T00:00:00.000Z"),
      status: "active" as const,
      version: 1,
    };

    expect(
      evaluatePersistentRisks({ payments: [payment(1, { amount: "8" })], budgets: [budget] }),
    ).toMatchObject([{ rule: "budget", severity: "medium" }]);
    expect(
      evaluatePersistentRisks({ payments: [payment(1, { amount: "10" })], budgets: [budget] }),
    ).toMatchObject([{ rule: "budget", severity: "high" }]);
  });

  it("detects repeated resources and stable evidence fingerprints", () => {
    const payments = [1, 2, 3].map((index) =>
      payment(index, { resourceUri: "https://api.example/data" }),
    );
    const first = evaluatePersistentRisks({ payments, budgets: [] });
    const replay = evaluatePersistentRisks({ payments: payments.toReversed(), budgets: [] });

    expect(first).toMatchObject([{ rule: "repeat_resource", severity: "medium" }]);
    expect(replay[0]?.ruleId).toBe(first[0]?.ruleId);
  });

  it("detects high velocity and relative price spikes", () => {
    const payments = [1, 2, 3, 4, 5].map((index) =>
      payment(index, { amount: index === 5 ? "5" : "1" }),
    );
    const risks = evaluatePersistentRisks({ payments, budgets: [] });

    expect(risks.map((risk) => risk.rule)).toEqual(["velocity", "price_spike"]);
  });

  it("hashes equivalent analysis inputs independently of row order", () => {
    const rangeStart = new Date("2026-06-20T00:00:00.000Z");
    const rangeEnd = new Date("2026-06-21T00:00:00.000Z");
    const payments = [payment(1), payment(2)];

    expect(buildRiskAnalysisInputHash({ rangeStart, rangeEnd, payments, budgets: [] })).toBe(
      buildRiskAnalysisInputHash({
        rangeStart,
        rangeEnd,
        payments: payments.toReversed(),
        budgets: [],
      }),
    );
  });
});
