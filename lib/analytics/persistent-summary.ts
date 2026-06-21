import { formatUsdcUnits, parseUsdc, type UsdcAmount } from "@/lib/domain/usdc";

export type SummaryPayment = {
  id: string;
  walletId: string;
  taskId?: string | null;
  providerId?: string | null;
  providerName?: string | null;
  category?: string | null;
  amount: UsdcAmount;
  occurredAt: Date;
};

export type SummaryBudget = {
  id: string;
  walletId?: string | null;
  taskId?: string | null;
  providerId?: string | null;
  amount: UsdcAmount;
  periodStart: Date;
  periodEnd: Date;
  status: "active" | "paused" | "archived";
  warningThreshold: string;
};

export type SummaryWallet = { id: string; label: string };
export type SummaryTask = { id: string; name: string; status: string };
export type SummaryRisk = { severity: "low" | "medium" | "high"; status: string };

function sumUnits<T>(items: T[], amount: (item: T) => UsdcAmount) {
  return items.reduce((total, item) => total + parseUsdc(amount(item)), BigInt(0));
}

function percentage(numerator: bigint, denominator: bigint) {
  return denominator > BigInt(0) ? Number((numerator * BigInt(1_000)) / denominator) / 10 : 0;
}

function matchesBudget(payment: SummaryPayment, budget: SummaryBudget) {
  return (
    payment.occurredAt >= budget.periodStart &&
    payment.occurredAt < budget.periodEnd &&
    (!budget.walletId || payment.walletId === budget.walletId) &&
    (!budget.taskId || payment.taskId === budget.taskId) &&
    (!budget.providerId || payment.providerId === budget.providerId)
  );
}

export function buildPersistentWorkspaceSummary(input: {
  rangeStart: Date;
  rangeEnd: Date;
  payments: SummaryPayment[];
  budgets: SummaryBudget[];
  wallets: SummaryWallet[];
  tasks: SummaryTask[];
  risks: SummaryRisk[];
}) {
  const totalSpendUnits = sumUnits(input.payments, (payment) => payment.amount);
  const activeBudgets = input.budgets.filter((budget) => budget.status === "active");
  const totalBudgetUnits = sumUnits(activeBudgets, (budget) => budget.amount);

  const wallets = input.wallets.map((wallet) => {
    const payments = input.payments.filter((payment) => payment.walletId === wallet.id);
    const budgets = activeBudgets.filter((budget) => budget.walletId === wallet.id);
    const spent = sumUnits(payments, (payment) => payment.amount);
    const assignedBudget = sumUnits(budgets, (budget) => budget.amount);
    return {
      id: wallet.id,
      label: wallet.label,
      spent: formatUsdcUnits(spent),
      assignedBudget: formatUsdcUnits(assignedBudget),
      paymentCount: payments.length,
      budgetUsed: percentage(spent, assignedBudget),
    };
  });

  const tasks = input.tasks.map((task) => {
    const payments = input.payments.filter((payment) => payment.taskId === task.id);
    const budgets = activeBudgets.filter((budget) => budget.taskId === task.id);
    const spent = sumUnits(payments, (payment) => payment.amount);
    const assignedBudget = sumUnits(budgets, (budget) => budget.amount);
    return {
      id: task.id,
      name: task.name,
      status: task.status,
      spent: formatUsdcUnits(spent),
      assignedBudget: formatUsdcUnits(assignedBudget),
      paymentCount: payments.length,
      share: percentage(spent, totalSpendUnits),
      budgetUsed: percentage(spent, assignedBudget),
    };
  });

  const budgets = input.budgets.map((budget) => {
    const payments = input.payments.filter((payment) => matchesBudget(payment, budget));
    const spent = sumUnits(payments, (payment) => payment.amount);
    const limit = parseUsdc(budget.amount);
    const remaining = limit > spent ? limit - spent : BigInt(0);
    const totalDuration = BigInt(
      Math.max(0, budget.periodEnd.getTime() - budget.periodStart.getTime()),
    );
    const effectiveEnd = Math.min(input.rangeEnd.getTime(), budget.periodEnd.getTime());
    const elapsedDuration = BigInt(Math.max(0, effectiveEnd - budget.periodStart.getTime()));
    const projected =
      elapsedDuration > BigInt(0) && totalDuration > BigInt(0)
        ? (spent * totalDuration) / elapsedDuration
        : BigInt(0);
    const used = percentage(spent, limit);
    const projectedUsed = percentage(projected, limit);
    const forecastStatus =
      budget.status !== "active"
        ? "inactive"
        : spent >= limit
          ? "over_limit"
          : projected >= limit
            ? "at_risk"
            : used >= Number(budget.warningThreshold)
              ? "warning"
              : "on_track";
    return {
      id: budget.id,
      spent: formatUsdcUnits(spent),
      limit: budget.amount,
      remaining: formatUsdcUnits(remaining),
      projectedSpend: formatUsdcUnits(projected),
      paymentCount: payments.length,
      used,
      projectedUsed,
      warningThreshold: Number(budget.warningThreshold),
      forecastStatus,
    };
  });

  const providerGroups = new Map<string, { name: string; payments: SummaryPayment[] }>();
  for (const payment of input.payments) {
    const key = payment.providerId ?? payment.providerName ?? "unknown";
    const group = providerGroups.get(key) ?? {
      name: payment.providerName ?? payment.providerId ?? "Unknown provider",
      payments: [],
    };
    group.payments.push(payment);
    providerGroups.set(key, group);
  }
  const providers = [...providerGroups.entries()]
    .map(([id, group]) => {
      const spent = sumUnits(group.payments, (payment) => payment.amount);
      return {
        id,
        name: group.name,
        spent: formatUsdcUnits(spent),
        paymentCount: group.payments.length,
        share: percentage(spent, totalSpendUnits),
      };
    })
    .toSorted((a, b) => {
      const difference = parseUsdc(b.spent) - parseUsdc(a.spent);
      return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
    });

  const categoryGroups = new Map<string, SummaryPayment[]>();
  for (const payment of input.payments) {
    const category = payment.category ?? "Uncategorized";
    categoryGroups.set(category, [...(categoryGroups.get(category) ?? []), payment]);
  }
  const categories = [...categoryGroups.entries()]
    .map(([category, payments]) => {
      const spent = sumUnits(payments, (payment) => payment.amount);
      return {
        category,
        spent: formatUsdcUnits(spent),
        paymentCount: payments.length,
        share: percentage(spent, totalSpendUnits),
      };
    })
    .toSorted((a, b) => {
      const difference = parseUsdc(b.spent) - parseUsdc(a.spent);
      return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
    });

  return {
    rangeStart: input.rangeStart.toISOString(),
    rangeEnd: input.rangeEnd.toISOString(),
    metrics: {
      totalSpend: formatUsdcUnits(totalSpendUnits),
      paymentCount: input.payments.length,
      averagePayment: formatUsdcUnits(
        input.payments.length ? totalSpendUnits / BigInt(input.payments.length) : BigInt(0),
      ),
      assignedBudget: formatUsdcUnits(totalBudgetUnits),
      budgetUsed: percentage(totalSpendUnits, totalBudgetUnits),
      openRisks: input.risks.filter((risk) => risk.status !== "resolved").length,
      highRisks: input.risks.filter(
        (risk) => risk.status !== "resolved" && risk.severity === "high",
      ).length,
    },
    wallets,
    tasks,
    budgets,
    providers,
    categories,
  };
}
