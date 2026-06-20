import { formatUsdcUnits, parseUsdc, type UsdcAmount } from "@/lib/domain/usdc";
import type { TaskSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

export function getBudgetUsed(totalSpend: UsdcAmount, budget: UsdcAmount) {
  const budgetUnits = parseUsdc(budget);
  if (budgetUnits <= BigInt(0)) {
    return 0;
  }

  return Number((parseUsdc(totalSpend) * BigInt(1000)) / budgetUnits) / 10;
}

export function getTaskSummaries(payments: PaymentEvent[], totalSpend: UsdcAmount): TaskSummary[] {
  const taskBudgets = new Map<string, UsdcAmount>([
    ["task_8f3a2c1d", "10000"],
    ["task_6b7e2f1a", "4700"],
    ["task_48ed21af", "3900"],
    ["task_9d11ff20", "3100"],
    ["task_a71c5f20", "1400"],
    ["task_12ac09de", "2800"],
    ["task_11ee904b", "500"],
    ["task_22aa90c4", "120"],
  ]);

  const tasks = new Map<string, TaskSummary>();

  for (const payment of payments) {
    const current = tasks.get(payment.taskId) ?? {
      id: payment.taskId,
      name: payment.taskName,
      amount: "0",
      share: 0,
      budget: taskBudgets.get(payment.taskId) ?? "1000",
      paymentCount: 0,
      status: "Within budget",
    };

    current.amount = formatUsdcUnits(parseUsdc(current.amount) + parseUsdc(payment.amount));
    current.paymentCount += 1;
    const totalUnits = parseUsdc(totalSpend);
    current.share =
      totalUnits > BigInt(0)
        ? Number((parseUsdc(current.amount) * BigInt(1000)) / totalUnits) / 10
        : 0;

    const taskBudgetUsed = getBudgetUsed(current.amount, current.budget);
    current.status =
      taskBudgetUsed >= 100 ? "Over budget" : taskBudgetUsed >= 80 ? "Near limit" : "Within budget";

    tasks.set(payment.taskId, current);
  }

  return [...tasks.values()].sort((a, b) => Number(parseUsdc(b.amount) - parseUsdc(a.amount)));
}
