import { describe, expect, it } from "vitest";

import { buildPersistentWorkspaceSummary } from "@/lib/analytics/persistent-summary";

describe("persistent workspace summary", () => {
  it("aggregates exact USDC facts across wallet, task, budget, provider, and category scopes", () => {
    const summary = buildPersistentWorkspaceSummary({
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
      wallets: [{ id: "wallet-1", label: "Agent" }],
      tasks: [{ id: "task-1", name: "Research", status: "running" }],
      payments: [
        {
          id: "payment-1",
          walletId: "wallet-1",
          taskId: "task-1",
          providerId: "provider-1",
          providerName: "Data API",
          category: "Data",
          amount: "0.000001",
          occurredAt: new Date("2026-06-20T12:00:00.000Z"),
        },
        {
          id: "payment-2",
          walletId: "wallet-1",
          taskId: "task-1",
          providerId: "provider-1",
          providerName: "Data API",
          category: "Data",
          amount: "0.000002",
          occurredAt: new Date("2026-06-20T12:01:00.000Z"),
        },
      ],
      previousPayments: [
        {
          id: "previous-payment",
          walletId: "wallet-1",
          amount: "0.000002",
          occurredAt: new Date("2026-06-19T12:00:00.000Z"),
        },
      ],
      budgets: [
        {
          id: "budget-1",
          walletId: "wallet-1",
          taskId: "task-1",
          amount: "0.000006",
          warningThreshold: "80",
          periodStart: new Date("2026-06-20T00:00:00.000Z"),
          periodEnd: new Date("2026-06-21T00:00:00.000Z"),
          status: "active",
        },
      ],
      risks: [{ severity: "high", status: "open" }],
    });

    expect(summary.metrics).toEqual({
      totalSpend: "0.000003",
      paymentCount: 2,
      averagePayment: "0.000001",
      medianPayment: "0.000001",
      previousPeriodSpend: "0.000002",
      previousPeriodPaymentCount: 1,
      spendChangePercent: 50,
      assignedBudget: "0.000006",
      budgetUsed: 50,
      openRisks: 1,
      highRisks: 1,
    });
    expect(summary.wallets).toMatchObject([
      { spent: "0.000003", assignedBudget: "0.000006", budgetUsed: 50 },
    ]);
    expect(summary.tasks).toMatchObject([{ spent: "0.000003", paymentCount: 2, share: 100 }]);
    expect(summary.budgets).toMatchObject([
      {
        spent: "0.000003",
        remaining: "0.000003",
        projectedSpend: "0.000003",
        used: 50,
        forecastStatus: "on_track",
      },
    ]);
    expect(summary.providers).toMatchObject([{ name: "Data API", spent: "0.000003", share: 100 }]);
    expect(summary.categories).toMatchObject([{ category: "Data", spent: "0.000003" }]);
  });

  it("calculates an exact median and a zero-to-zero period comparison", () => {
    const summary = buildPersistentWorkspaceSummary({
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
      wallets: [],
      tasks: [],
      payments: ["100", "1", "2"].map((amount, index) => ({
        id: `payment-${index}`,
        walletId: "wallet-1",
        amount,
        occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      })),
      previousPayments: [],
      budgets: [],
      risks: [],
    });

    expect(summary.metrics).toMatchObject({
      medianPayment: "2",
      previousPeriodSpend: "0",
      spendChangePercent: null,
    });
    expect(summary.comparison).toEqual({
      rangeStart: "2026-06-19T00:00:00.000Z",
      rangeEnd: "2026-06-20T00:00:00.000Z",
    });
  });

  it("does not count payments outside a budget period toward that limit", () => {
    const summary = buildPersistentWorkspaceSummary({
      rangeStart: new Date("2026-06-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-01T00:00:00.000Z"),
      wallets: [],
      tasks: [],
      payments: [
        {
          id: "payment-1",
          walletId: "wallet-1",
          amount: "5",
          occurredAt: new Date("2026-06-10T00:00:00.000Z"),
        },
      ],
      budgets: [
        {
          id: "budget-1",
          amount: "10",
          warningThreshold: "80",
          periodStart: new Date("2026-06-20T00:00:00.000Z"),
          periodEnd: new Date("2026-06-21T00:00:00.000Z"),
          status: "active",
        },
      ],
      risks: [],
    });

    expect(summary.budgets[0]).toMatchObject({ spent: "0", used: 0 });
  });
});
