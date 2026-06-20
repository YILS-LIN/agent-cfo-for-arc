import { getRecentPayments } from "@/lib/analytics/classify-spend";
import type { buildPersistentWorkspaceSummary } from "@/lib/analytics/persistent-summary";
import { generateCfoReport } from "@/lib/reports/generate-cfo-report";
import type { AgentSpendSummary, TaskSummary } from "@/types/agent";
import type { PaymentEvent, RiskSignal } from "@/types/payment";

export type DashboardPayment = {
  id: string;
  walletId: string;
  taskId?: string | null;
  externalId: string;
  transactionHash?: string | null;
  amount: string;
  providerName?: string | null;
  category?: string | null;
  resourceUri?: string | null;
  occurredAt: Date;
  source: "demo" | "circle_gateway" | "arc" | "x402";
  rawReference?: string | null;
  metadata: Record<string, unknown>;
};

export type DashboardWallet = {
  id: string;
  address: string;
  chainId: number;
  label: string;
  isPrimary: boolean;
};

export type DashboardTask = { id: string; name: string };
export type DashboardRisk = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  status: "open" | "investigating" | "resolved";
  evidence: Record<string, unknown>;
};

type WorkspaceSummary = ReturnType<typeof buildPersistentWorkspaceSummary>;

function riskCategory(rule: unknown): RiskSignal["category"] {
  if (rule === "budget") return "budget";
  if (rule === "repeat_resource") return "repeat";
  if (rule === "velocity" || rule === "price_spike") return "spike";
  return "provider";
}

export function buildPersistentDashboard(input: {
  calculatedAt: Date;
  summary: WorkspaceSummary;
  payments: DashboardPayment[];
  wallets: DashboardWallet[];
  tasks: DashboardTask[];
  risks: DashboardRisk[];
}): AgentSpendSummary {
  const walletById = new Map(input.wallets.map((wallet) => [wallet.id, wallet]));
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const primaryWallet =
    input.wallets.find((wallet) => wallet.isPrimary) ?? input.wallets[0] ?? null;
  const payments: PaymentEvent[] = input.payments.map((payment) => {
    const wallet = walletById.get(payment.walletId);
    const memo = typeof payment.metadata.memo === "string" ? payment.metadata.memo : undefined;
    const payee = typeof payment.metadata.payee === "string" ? payment.metadata.payee : "";
    return {
      id: payment.id,
      txHash: payment.transactionHash ?? "",
      wallet: wallet?.address ?? "",
      provider: payment.providerName ?? "Unknown provider",
      providerLogo: "",
      payee,
      category: (payment.category ?? "Uncategorized") as PaymentEvent["category"],
      taskId: payment.taskId ?? "",
      taskName: payment.taskId
        ? (taskById.get(payment.taskId)?.name ?? "Unknown task")
        : "Unassigned",
      amount: payment.amount,
      currency: "USDC",
      timestamp: payment.occurredAt.toISOString(),
      status: "completed",
      memo: memo ?? payment.resourceUri ?? `External event ${payment.externalId}`,
      x402Resource: payment.resourceUri ?? "",
      chainId: wallet?.chainId ?? 0,
      source: payment.source,
      rawReference: payment.rawReference ?? undefined,
    };
  });
  const providers = input.summary.providers.map((provider) => ({
    provider: provider.name,
    providerLogo: "",
    amount: provider.spent,
    paymentCount: provider.paymentCount,
    share: provider.share,
  }));
  const categories = input.summary.categories.map((category) => ({
    category: category.category,
    amount: category.spent,
    paymentCount: category.paymentCount,
    share: category.share,
  }));
  const risks: RiskSignal[] = input.risks
    .filter((risk) => risk.status !== "resolved")
    .map((risk) => ({
      id: risk.id,
      title: risk.title,
      description: risk.description,
      severity:
        `${risk.severity.slice(0, 1).toUpperCase()}${risk.severity.slice(1)}` as RiskSignal["severity"],
      category: riskCategory(risk.evidence.rule),
    }));
  const tasks: TaskSummary[] = input.summary.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    amount: task.spent,
    share: task.share,
    budget: task.assignedBudget,
    paymentCount: task.paymentCount,
    status:
      task.budgetUsed >= 100
        ? "Over budget"
        : task.budgetUsed >= 80
          ? "Near limit"
          : "Within budget",
  }));
  const riskLevel = risks.some((risk) => risk.severity === "High")
    ? "High"
    : risks.some((risk) => risk.severity === "Medium")
      ? "Medium"
      : "Low";
  const report = generateCfoReport({
    totalSpend: input.summary.metrics.totalSpend,
    budgetUsed: input.summary.metrics.budgetUsed,
    providers,
    categories,
    tasks,
    risks,
  });

  return {
    analysis: {
      source: "workspace",
      isLive: true,
      calculatedAt: input.calculatedAt.toISOString(),
      version: "workspace-v1",
    },
    profile: {
      wallet: primaryWallet?.address ?? "",
      displayName: primaryWallet?.label ?? "Workspace portfolio",
      network: "Arc Testnet",
      budget: input.summary.metrics.assignedBudget,
      owner: "Workspace member",
      dateRange: {
        from: input.summary.rangeStart.slice(0, 10),
        to: input.summary.rangeEnd.slice(0, 10),
      },
    },
    metrics: {
      totalSpend: input.summary.metrics.totalSpend,
      paymentCount: input.summary.metrics.paymentCount,
      averagePayment: input.summary.metrics.averagePayment,
      budgetUsed: input.summary.metrics.budgetUsed,
      topCategory: categories[0]?.category ?? "Unknown",
      riskLevel,
    },
    payments: getRecentPayments(payments, 6),
    providers,
    categories,
    risks,
    tasks,
    report,
  };
}
