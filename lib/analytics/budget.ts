import type { TaskSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function getBudgetUsed(totalSpend: number, budget: number) {
  if (budget <= 0) {
    return 0;
  }

  return Math.round((totalSpend / budget) * 1000) / 10;
}

export function getTaskSummaries(payments: PaymentEvent[], totalSpend: number): TaskSummary[] {
  const taskBudgets = new Map<string, number>([
    ["task_8f3a2c1d", 10000],
    ["task_6b7e2f1a", 4700],
    ["task_48ed21af", 3900],
    ["task_9d11ff20", 3100],
    ["task_a71c5f20", 1400],
    ["task_12ac09de", 2800],
    ["task_11ee904b", 500],
    ["task_22aa90c4", 120],
  ]);

  const tasks = new Map<string, TaskSummary>();

  for (const payment of payments) {
    const current = tasks.get(payment.taskId) ?? {
      id: payment.taskId,
      name: payment.taskName,
      amount: 0,
      share: 0,
      budget: taskBudgets.get(payment.taskId) ?? 1000,
      paymentCount: 0,
      status: "Within budget",
    };

    current.amount = roundCurrency(current.amount + payment.amount);
    current.paymentCount += 1;
    current.share = totalSpend > 0 ? Math.round((current.amount / totalSpend) * 1000) / 10 : 0;

    const taskBudgetUsed = getBudgetUsed(current.amount, current.budget);
    current.status =
      taskBudgetUsed >= 100 ? "Over budget" : taskBudgetUsed >= 80 ? "Near limit" : "Within budget";

    tasks.set(payment.taskId, current);
  }

  return [...tasks.values()].sort((a, b) => b.amount - a.amount);
}
