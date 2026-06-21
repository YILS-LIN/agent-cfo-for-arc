import { describe, expect, it } from "vitest";

import { buildMetricTrends, buildSpendActivityPoints } from "@/lib/analytics/chart-series";
import type { PaymentEvent } from "@/types/payment";

function payment(timestamp: string, amount: string): PaymentEvent {
  return {
    id: `${timestamp}-${amount}`,
    txHash: "0x1",
    wallet: "0x1111111111111111111111111111111111111111",
    provider: "Provider",
    providerLogo: "",
    payee: "0x2222222222222222222222222222222222222222",
    category: "Data",
    taskId: "task",
    taskName: "Task",
    amount,
    currency: "USDC",
    timestamp,
    status: "completed",
    memo: "",
    x402Resource: "https://example.com",
    chainId: 5_042_002,
    source: "demo",
  };
}

describe("dashboard chart series", () => {
  const payments = [
    payment("2026-06-01T12:00:00.000Z", "1.25"),
    payment("2026-06-01T18:00:00.000Z", "0.75"),
    payment("2026-06-07T12:00:00.000Z", "3"),
  ];

  it("buckets visible payments without inventing activity", () => {
    const points = buildSpendActivityPoints(
      payments,
      "2026-06-01T00:00:00.000Z",
      "2026-06-08T00:00:00.000Z",
    );
    expect(points).toHaveLength(7);
    expect(points[0]).toMatchObject({ value: 2, payments: 2 });
    expect(points[6]).toMatchObject({ value: 3, payments: 1 });
    expect(points.slice(1, 6).every((point) => point.value === 0)).toBe(true);
  });

  it("builds cumulative metric trends from payment facts", () => {
    const trends = buildMetricTrends(payments, "10");
    expect(trends).toHaveLength(8);
    expect(trends.at(-1)).toEqual({ spend: 5, count: 3, average: 5 / 3, budgetUsed: 50 });
    expect(
      trends.every((point, index) => index === 0 || point.spend >= trends[index - 1].spend),
    ).toBe(true);
  });

  it("ignores malformed timestamps when selecting a fallback range", () => {
    const points = buildSpendActivityPoints(
      [payment("invalid", "1")],
      "invalid",
      "invalid",
      new Date("2026-06-08T00:00:00.000Z").getTime(),
    );
    expect(points).toHaveLength(7);
    expect(points.every((point) => point.value === 0)).toBe(true);
  });
});
