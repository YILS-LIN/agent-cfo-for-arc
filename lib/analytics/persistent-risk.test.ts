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

  it("flags a projected overrun before the warning threshold is reached", () => {
    const budget = {
      id: "budget-forecast",
      amount: "10",
      warningThreshold: "80",
      periodStart: new Date("2026-06-20T00:00:00.000Z"),
      periodEnd: new Date("2026-06-21T00:00:00.000Z"),
      status: "active" as const,
      version: 1,
    };
    const payments = [
      payment(1, { amount: "3", occurredAt: new Date("2026-06-20T06:00:00.000Z") }),
      payment(2, { amount: "3", occurredAt: new Date("2026-06-20T12:00:00.000Z") }),
    ];

    expect(evaluatePersistentRisks({ payments, budgets: [budget] })).toMatchObject([
      { rule: "budget_forecast", severity: "medium" },
    ]);
  });

  it("detects high velocity and relative price spikes", () => {
    const payments = [1, 2, 3, 4, 5].map((index) =>
      payment(index, { amount: index === 5 ? "5" : "1" }),
    );
    const risks = evaluatePersistentRisks({ payments, budgets: [] });

    expect(risks.map((risk) => risk.rule)).toEqual(["velocity", "price_spike"]);
  });

  it("flags unapproved and blocked providers while allowing approved providers", () => {
    const payments = [
      payment(1, { providerId: "allowed" }),
      payment(2, { providerId: "review" }),
      payment(3, { providerId: "blocked" }),
      payment(4, { providerId: "new" }),
    ];
    const risks = evaluatePersistentRisks({
      payments,
      budgets: [],
      providerPolicies: [
        { providerKey: "allowed", decision: "allowed", version: 1 },
        { providerKey: "review", decision: "review", version: 2 },
        { providerKey: "blocked", decision: "blocked", version: 3 },
      ],
    }).filter((risk) => risk.rule === "provider_policy");

    expect(risks).toMatchObject([
      { severity: "medium", evidence: { providerId: "review", decision: "review" } },
      { severity: "high", evidence: { providerId: "blocked", decision: "blocked" } },
      { severity: "medium", evidence: { providerId: "new", decision: "unreviewed" } },
    ]);
  });

  it("detects provider concentration and task cost baseline deviations", () => {
    const concentrated = [1, 2, 3, 4, 5].map((index) =>
      payment(index, { providerId: index < 5 ? "provider-a" : "provider-b" }),
    );
    const concentration = evaluatePersistentRisks({
      payments: concentrated,
      budgets: [],
      providerPolicies: [
        { providerKey: "provider-a", decision: "allowed", version: 1 },
        { providerKey: "provider-b", decision: "allowed", version: 1 },
      ],
    });
    expect(concentration).toContainEqual(
      expect.objectContaining({
        rule: "concentration",
        evidence: expect.objectContaining({ dimension: "provider", shareBasisPoints: 8000 }),
      }),
    );

    const taskPayments = [
      payment(11, { taskId: "task-a", amount: "1" }),
      payment(12, { taskId: "task-b", amount: "1" }),
      payment(13, { taskId: "task-c", amount: "1" }),
      payment(14, { taskId: "task-d", amount: "4" }),
    ];
    expect(evaluatePersistentRisks({ payments: taskPayments, budgets: [] })).toContainEqual(
      expect.objectContaining({ rule: "task_baseline", taskId: "task-d" }),
    );
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
