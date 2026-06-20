import { describe, expect, it } from "vitest";

import { buildPersistentDashboard } from "@/lib/analytics/persistent-dashboard";
import { buildPersistentWorkspaceSummary } from "@/lib/analytics/persistent-summary";

describe("persistent dashboard projection", () => {
  it("projects workspace facts into the existing dashboard contract without demo labels", () => {
    const rangeStart = new Date("2026-06-20T00:00:00.000Z");
    const rangeEnd = new Date("2026-06-21T00:00:00.000Z");
    const wallets = [
      {
        id: "wallet-1",
        address: "0x1111111111111111111111111111111111111111",
        chainId: 5_042_002,
        label: "Primary agent",
        isPrimary: true,
      },
    ];
    const tasks = [{ id: "task-1", name: "Research" }];
    const payments = [
      {
        id: "payment-1",
        walletId: "wallet-1",
        taskId: "task-1",
        externalId: "external-1",
        amount: "0.01",
        providerName: "Research API",
        category: "Data",
        occurredAt: new Date("2026-06-20T12:00:00.000Z"),
        source: "x402" as const,
        metadata: { memo: "Dataset", payee: "0xpayee" },
      },
    ];
    const risks = [
      {
        id: "risk-1",
        title: "Budget exceeded",
        description: "Observed spend exceeded the limit",
        severity: "high" as const,
        status: "open" as const,
        evidence: { rule: "budget" },
      },
    ];
    const summary = buildPersistentWorkspaceSummary({
      rangeStart,
      rangeEnd,
      wallets,
      tasks: [{ ...tasks[0]!, status: "running" }],
      payments,
      budgets: [],
      risks,
    });

    const dashboard = buildPersistentDashboard({
      calculatedAt: rangeEnd,
      summary,
      payments,
      wallets,
      tasks,
      risks,
    });

    expect(dashboard.analysis).toMatchObject({ source: "workspace", isLive: true });
    expect(dashboard.profile).toMatchObject({
      wallet: wallets[0]!.address,
      displayName: "Primary agent",
    });
    expect(dashboard.metrics).toMatchObject({ totalSpend: "0.01", riskLevel: "High" });
    expect(dashboard.payments).toMatchObject([
      { provider: "Research API", taskName: "Research", source: "x402" },
    ]);
    expect(dashboard.risks).toMatchObject([{ category: "budget", severity: "High" }]);
  });
});
