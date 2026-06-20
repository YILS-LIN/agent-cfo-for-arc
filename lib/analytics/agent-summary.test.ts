import { describe, expect, it } from "vitest";

import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { sumUsdc } from "@/lib/domain/usdc";
import type { PaymentEvent } from "@/types/payment";

const payments: PaymentEvent[] = [
  {
    id: "payment-1",
    txHash: "0x1",
    wallet: "0xdemo",
    provider: "Provider A",
    providerLogo: "A",
    payee: "0xpayee-a",
    category: "Data",
    taskId: "task-a",
    taskName: "Task A",
    amount: "0.1",
    currency: "USDC",
    timestamp: "2026-06-20T00:00:00.000Z",
    status: "completed",
    memo: "First fact",
    x402Resource: "/data/a",
    chainId: 5_042_002,
    source: "demo",
  },
  {
    id: "payment-2",
    txHash: "0x2",
    wallet: "0xdemo",
    provider: "Provider A",
    providerLogo: "A",
    payee: "0xpayee-a",
    category: "Data",
    taskId: "task-a",
    taskName: "Task A",
    amount: "0.2",
    currency: "USDC",
    timestamp: "2026-06-20T00:01:00.000Z",
    status: "completed",
    memo: "Second fact",
    x402Resource: "/data/b",
    chainId: 5_042_002,
    source: "demo",
  },
];

describe("agent spend summary reconciliation", () => {
  it("derives counts and amounts from payment facts", () => {
    const summary = buildAgentSpendSummary({ payments });

    expect(summary.metrics.paymentCount).toBe(payments.length);
    expect(summary.metrics.totalSpend).toBe(sumUsdc(payments.map((payment) => payment.amount)));
    expect(summary.metrics.averagePayment).toBe("0.15");
    expect(summary.providers[0]?.amount).toBe("0.3");
    expect(summary.categories[0]?.amount).toBe("0.3");
    expect(summary.tasks[0]?.amount).toBe("0.3");
  });

  it("labels deterministic results as non-live demo analysis", () => {
    const summary = buildAgentSpendSummary({ payments });

    expect(summary.analysis).toMatchObject({ source: "demo", isLive: false, version: "demo-v1" });
  });
});
