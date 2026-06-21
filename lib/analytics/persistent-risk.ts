import { createHash } from "node:crypto";

import { formatUsdcUnits, parseUsdc, type UsdcAmount } from "@/lib/domain/usdc";

export type RiskPayment = {
  id: string;
  walletId: string;
  taskId?: string | null;
  providerId?: string | null;
  category?: string | null;
  resourceUri?: string | null;
  amount: UsdcAmount;
  occurredAt: Date;
};

export type RiskBudget = {
  id: string;
  walletId?: string | null;
  taskId?: string | null;
  providerId?: string | null;
  amount: UsdcAmount;
  warningThreshold: string;
  periodStart: Date;
  periodEnd: Date;
  status: "active" | "paused" | "archived";
  version: number;
};

export type RiskProviderPolicy = {
  providerKey: string;
  decision: "allowed" | "review" | "blocked";
  version: number;
};

export type PersistentRiskRule = {
  ruleId: string;
  rule:
    | "budget"
    | "budget_forecast"
    | "repeat_resource"
    | "velocity"
    | "price_spike"
    | "provider_policy"
    | "concentration"
    | "task_baseline";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  walletId?: string;
  taskId?: string;
  evidence: Record<string, unknown>;
};

function fingerprint(rule: string, facts: unknown) {
  return `${rule}:${createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16)}`;
}

function percentageBasisPoints(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) throw new Error(`Invalid percentage: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

function matchesBudget(payment: RiskPayment, budget: RiskBudget) {
  return (
    payment.occurredAt >= budget.periodStart &&
    payment.occurredAt < budget.periodEnd &&
    (!budget.walletId || payment.walletId === budget.walletId) &&
    (!budget.taskId || payment.taskId === budget.taskId) &&
    (!budget.providerId || payment.providerId === budget.providerId)
  );
}

function budgetRules(payments: RiskPayment[], budgets: RiskBudget[]): PersistentRiskRule[] {
  return budgets.flatMap((budget): PersistentRiskRule[] => {
    if (budget.status !== "active") return [];
    const matching = payments.filter((payment) => matchesBudget(payment, budget));
    const spent = matching.reduce((total, payment) => total + parseUsdc(payment.amount), BigInt(0));
    const limit = parseUsdc(budget.amount);
    const warning = (limit * percentageBasisPoints(budget.warningThreshold)) / BigInt(10_000);
    if (spent < warning) {
      if (matching.length < 2 || spent === BigInt(0)) return [];
      const latest = Math.max(...matching.map((payment) => payment.occurredAt.getTime()));
      const elapsed = BigInt(Math.max(0, latest - budget.periodStart.getTime()));
      const duration = BigInt(
        Math.max(0, budget.periodEnd.getTime() - budget.periodStart.getTime()),
      );
      if (elapsed === BigInt(0) || duration === BigInt(0)) return [];
      const projected = (spent * duration) / elapsed;
      if (projected < limit) return [];
      const facts = {
        budgetId: budget.id,
        budgetVersion: budget.version,
        paymentIds: matching.map((payment) => payment.id).sort(),
        spent: spent.toString(),
        projected: projected.toString(),
      };
      return [
        {
          ruleId: fingerprint(`budget_forecast.${budget.id}`, facts),
          rule: "budget_forecast" as const,
          severity: "medium" as const,
          title: "Budget pace projects an overrun",
          description: `${formatUsdcUnits(projected)} USDC projected against a ${budget.amount} USDC limit`,
          walletId: budget.walletId ?? undefined,
          taskId: budget.taskId ?? undefined,
          evidence: { ...facts, projectedSpend: formatUsdcUnits(projected), limit: budget.amount },
        },
      ];
    }
    const exceeded = spent >= limit;
    const facts = {
      budgetId: budget.id,
      budgetVersion: budget.version,
      paymentIds: matching.map((payment) => payment.id).sort(),
      spent: spent.toString(),
    };
    return [
      {
        ruleId: fingerprint(`budget.${budget.id}`, facts),
        rule: "budget" as const,
        severity: exceeded ? ("high" as const) : ("medium" as const),
        title: exceeded ? "Budget exceeded" : "Budget warning threshold reached",
        description: `${formatUsdcUnits(spent)} USDC observed against a ${budget.amount} USDC limit`,
        walletId: budget.walletId ?? undefined,
        taskId: budget.taskId ?? undefined,
        evidence: { ...facts, limit: budget.amount, warningThreshold: budget.warningThreshold },
      },
    ];
  });
}

function repeatedResourceRules(payments: RiskPayment[]): PersistentRiskRule[] {
  const grouped = new Map<string, RiskPayment[]>();
  for (const payment of payments) {
    if (!payment.resourceUri) continue;
    const key = `${payment.walletId}\u0000${payment.resourceUri}`;
    grouped.set(key, [...(grouped.get(key) ?? []), payment]);
  }
  return [...grouped.entries()].flatMap(([key, matching]) => {
    if (matching.length < 3) return [];
    const resourceUri = key.split("\u0000")[1] ?? "unknown";
    const paymentIds = matching.map((payment) => payment.id).sort();
    return [
      {
        ruleId: fingerprint("repeat_resource", paymentIds),
        rule: "repeat_resource" as const,
        severity: "medium" as const,
        title: "Repeated paid resource",
        description: `${matching.length} payments referenced the same resource`,
        walletId: matching[0]?.walletId,
        evidence: { resourceUri, paymentIds, count: matching.length },
      },
    ];
  });
}

function velocityRules(payments: RiskPayment[]): PersistentRiskRule[] {
  const byWallet = new Map<string, RiskPayment[]>();
  for (const payment of payments) {
    byWallet.set(payment.walletId, [...(byWallet.get(payment.walletId) ?? []), payment]);
  }
  return [...byWallet.entries()].flatMap(([walletId, walletPayments]) => {
    const ordered = walletPayments.toSorted(
      (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
    );
    let left = 0;
    for (let right = 0; right < ordered.length; right += 1) {
      while (
        ordered[right] &&
        ordered[left] &&
        ordered[right].occurredAt.getTime() - ordered[left].occurredAt.getTime() > 60_000
      ) {
        left += 1;
      }
      const window = ordered.slice(left, right + 1);
      if (window.length >= 5) {
        const paymentIds = window.map((payment) => payment.id).sort();
        return [
          {
            ruleId: fingerprint("velocity", paymentIds),
            rule: "velocity" as const,
            severity: "high" as const,
            title: "High payment velocity",
            description: `${window.length} payments occurred within 60 seconds`,
            walletId,
            evidence: { paymentIds, windowSeconds: 60, count: window.length },
          },
        ];
      }
    }
    return [];
  });
}

function priceSpikeRules(payments: RiskPayment[]): PersistentRiskRule[] {
  const byWallet = new Map<string, RiskPayment[]>();
  for (const payment of payments) {
    byWallet.set(payment.walletId, [...(byWallet.get(payment.walletId) ?? []), payment]);
  }
  return [...byWallet.entries()].flatMap(([walletId, walletPayments]) => {
    if (walletPayments.length < 5) return [];
    const ordered = walletPayments.toSorted((a, b) => {
      const difference = parseUsdc(a.amount) - parseUsdc(b.amount);
      return difference < BigInt(0) ? -1 : difference > BigInt(0) ? 1 : 0;
    });
    const median = parseUsdc(ordered[Math.floor(ordered.length / 2)]?.amount ?? "0");
    const largest = ordered.at(-1);
    if (!largest || median === BigInt(0) || parseUsdc(largest.amount) < median * BigInt(5)) {
      return [];
    }
    const facts = {
      walletId,
      paymentId: largest.id,
      amount: largest.amount,
      median: formatUsdcUnits(median),
      sampleSize: ordered.length,
    };
    return [
      {
        ruleId: fingerprint("price_spike", facts),
        rule: "price_spike" as const,
        severity: "medium" as const,
        title: "Relative price spike",
        description: `${largest.amount} USDC was at least 5× the wallet median payment`,
        walletId,
        taskId: largest.taskId ?? undefined,
        evidence: facts,
      },
    ];
  });
}

function providerPolicyRules(
  payments: RiskPayment[],
  policies: RiskProviderPolicy[],
): PersistentRiskRule[] {
  const policyByProvider = new Map(policies.map((policy) => [policy.providerKey, policy]));
  const byProvider = new Map<string, RiskPayment[]>();
  for (const payment of payments) {
    if (!payment.providerId) continue;
    byProvider.set(payment.providerId, [...(byProvider.get(payment.providerId) ?? []), payment]);
  }
  return [...byProvider.entries()].flatMap(([providerId, matching]): PersistentRiskRule[] => {
    const policy = policyByProvider.get(providerId);
    if (policy?.decision === "allowed") return [];
    const paymentIds = matching.map((payment) => payment.id).sort();
    const facts = {
      providerId,
      decision: policy?.decision ?? "unreviewed",
      policyVersion: policy?.version ?? null,
      paymentIds,
    };
    return [
      {
        ruleId: fingerprint(`provider_policy.${providerId}`, facts),
        rule: "provider_policy",
        severity: policy?.decision === "blocked" ? "high" : "medium",
        title:
          policy?.decision === "blocked" ? "Blocked provider used" : "Unapproved provider used",
        description: `${matching.length} payment${matching.length === 1 ? "" : "s"} used provider ${providerId}`,
        walletId: matching[0]?.walletId,
        evidence: facts,
      },
    ];
  });
}

function concentrationRules(payments: RiskPayment[]): PersistentRiskRule[] {
  if (payments.length < 5) return [];
  const total = payments.reduce((sum, payment) => sum + parseUsdc(payment.amount), BigInt(0));
  if (total === BigInt(0)) return [];
  const dimensions: Array<{
    name: "provider" | "category";
    value: (payment: RiskPayment) => string | null | undefined;
  }> = [
    { name: "provider", value: (payment) => payment.providerId },
    { name: "category", value: (payment) => payment.category },
  ];
  return dimensions.flatMap(({ name, value }): PersistentRiskRule[] => {
    const groups = new Map<string, RiskPayment[]>();
    for (const payment of payments) {
      const key = value(payment);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) ?? []), payment]);
    }
    if (groups.size < 2) return [];
    const ranked = [...groups.entries()]
      .map(([key, matching]) => ({
        key,
        matching,
        spent: matching.reduce((sum, payment) => sum + parseUsdc(payment.amount), BigInt(0)),
      }))
      .toSorted((left, right) =>
        left.spent > right.spent ? -1 : left.spent < right.spent ? 1 : 0,
      );
    const leader = ranked[0];
    if (!leader || leader.spent * BigInt(100) < total * BigInt(70)) return [];
    const shareBasisPoints = Number((leader.spent * BigInt(10_000)) / total);
    const facts = {
      dimension: name,
      value: leader.key,
      shareBasisPoints,
      paymentIds: leader.matching.map((payment) => payment.id).sort(),
      totalSpend: formatUsdcUnits(total),
      concentratedSpend: formatUsdcUnits(leader.spent),
    };
    return [
      {
        ruleId: fingerprint(`concentration.${name}`, facts),
        rule: "concentration",
        severity: shareBasisPoints >= 8_500 ? "high" : "medium",
        title: `${name === "provider" ? "Provider" : "Category"} spend concentration`,
        description: `${(shareBasisPoints / 100).toFixed(1)}% of spend is concentrated in ${leader.key}`,
        evidence: facts,
      },
    ];
  });
}

function taskBaselineRules(payments: RiskPayment[]): PersistentRiskRule[] {
  const byTask = new Map<string, RiskPayment[]>();
  for (const payment of payments) {
    if (!payment.taskId) continue;
    byTask.set(payment.taskId, [...(byTask.get(payment.taskId) ?? []), payment]);
  }
  if (byTask.size < 4) return [];
  const totals = [...byTask.entries()]
    .map(([taskId, matching]) => ({
      taskId,
      matching,
      spent: matching.reduce((sum, payment) => sum + parseUsdc(payment.amount), BigInt(0)),
    }))
    .toSorted((left, right) => (left.spent < right.spent ? -1 : left.spent > right.spent ? 1 : 0));
  const median = totals[Math.floor(totals.length / 2)]?.spent ?? BigInt(0);
  const largest = totals.at(-1);
  if (!largest || median === BigInt(0) || largest.spent < median * BigInt(3)) return [];
  const facts = {
    taskId: largest.taskId,
    taskSpend: formatUsdcUnits(largest.spent),
    medianTaskSpend: formatUsdcUnits(median),
    sampleSize: totals.length,
    paymentIds: largest.matching.map((payment) => payment.id).sort(),
  };
  return [
    {
      ruleId: fingerprint("task_baseline", facts),
      rule: "task_baseline",
      severity: "medium",
      title: "Task cost exceeds its peer baseline",
      description: `${facts.taskSpend} USDC is at least 3× the median task cost`,
      walletId: largest.matching[0]?.walletId,
      taskId: largest.taskId,
      evidence: facts,
    },
  ];
}

export function evaluatePersistentRisks(input: {
  payments: RiskPayment[];
  budgets: RiskBudget[];
  providerPolicies?: RiskProviderPolicy[];
}) {
  return [
    ...budgetRules(input.payments, input.budgets),
    ...repeatedResourceRules(input.payments),
    ...velocityRules(input.payments),
    ...priceSpikeRules(input.payments),
    ...providerPolicyRules(input.payments, input.providerPolicies ?? []),
    ...concentrationRules(input.payments),
    ...taskBaselineRules(input.payments),
  ];
}

export function buildRiskAnalysisInputHash(input: {
  rangeStart: Date;
  rangeEnd: Date;
  payments: RiskPayment[];
  budgets: RiskBudget[];
  providerPolicies?: RiskProviderPolicy[];
}) {
  const facts = {
    rangeStart: input.rangeStart.toISOString(),
    rangeEnd: input.rangeEnd.toISOString(),
    payments: input.payments
      .map((payment) => ({
        id: payment.id,
        walletId: payment.walletId,
        taskId: payment.taskId ?? null,
        providerId: payment.providerId ?? null,
        category: payment.category ?? null,
        resourceUri: payment.resourceUri ?? null,
        amount: payment.amount,
        occurredAt: payment.occurredAt.toISOString(),
      }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
    providerPolicies: (input.providerPolicies ?? [])
      .map((policy) => ({
        providerKey: policy.providerKey,
        decision: policy.decision,
        version: policy.version,
      }))
      .toSorted((a, b) => a.providerKey.localeCompare(b.providerKey)),
    budgets: input.budgets
      .map((budget) => ({
        id: budget.id,
        walletId: budget.walletId ?? null,
        taskId: budget.taskId ?? null,
        providerId: budget.providerId ?? null,
        amount: budget.amount,
        warningThreshold: budget.warningThreshold,
        periodStart: budget.periodStart.toISOString(),
        periodEnd: budget.periodEnd.toISOString(),
        status: budget.status,
        version: budget.version,
      }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}
