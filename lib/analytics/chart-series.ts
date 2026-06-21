import type { UsdcAmount } from "@/lib/domain/usdc";
import type { SpendActivityPoint } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

export function buildSpendActivityPoints(
  payments: PaymentEvent[],
  from: string,
  to: string,
  now = Date.now(),
): SpendActivityPoint[] {
  const parsedStart = new Date(from).getTime();
  const rawEnd = new Date(to).getTime();
  const parsedEnd = /^\d{4}-\d{2}-\d{2}$/.test(to) ? rawEnd + 24 * 60 * 60 * 1_000 : rawEnd;
  const validTimestamps = payments
    .map((payment) => new Date(payment.timestamp).getTime())
    .filter(Number.isFinite);
  const fallbackEnd = Math.max(now, ...validTimestamps);
  const end =
    Number.isFinite(parsedEnd) && parsedEnd > parsedStart
      ? parsedEnd
      : Number.isFinite(parsedStart)
        ? parsedStart + 24 * 60 * 60 * 1_000
        : fallbackEnd;
  const start =
    Number.isFinite(parsedStart) && parsedStart < end
      ? parsedStart
      : end - 7 * 24 * 60 * 60 * 1_000;
  const bucketCount = 12;
  const bucketWidth = Math.max(1, (end - start) / bucketCount);
  const points = Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(start + bucketWidth * (index + 0.5));
    return {
      label: new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date),
      bucketStart: new Date(start + bucketWidth * index).toISOString(),
      amount: 0,
      payments: 0,
    };
  });
  for (const payment of payments) {
    const timestamp = new Date(payment.timestamp).getTime();
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > end) continue;
    const index = Math.min(
      bucketCount - 1,
      Math.max(0, Math.floor((timestamp - start) / bucketWidth)),
    );
    points[index].amount += Number(payment.amount);
    points[index].payments += 1;
  }
  return points;
}

export function buildMetricTrends(payments: PaymentEvent[], budget: UsdcAmount) {
  const sorted = [...payments].sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
  const budgetValue = Number(budget);
  return Array.from({ length: 8 }, (_, index) => {
    const count = Math.ceil((sorted.length * (index + 1)) / 8);
    const spend = sorted
      .slice(0, count)
      .reduce((total, payment) => total + Number(payment.amount), 0);
    return {
      spend,
      count,
      average: count ? spend / count : 0,
      budgetUsed: budgetValue > 0 ? (spend / budgetValue) * 100 : 0,
    };
  });
}
