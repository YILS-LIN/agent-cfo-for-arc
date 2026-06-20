import type { RiskSignal } from "@/types/payment";
import type { PaymentEvent } from "@/types/payment";

export function detectRiskSignals(payments: PaymentEvent[], budgetUsed: number): RiskSignal[] {
  const risks: RiskSignal[] = [];
  const repeatedMemos = payments.filter((payment) =>
    payment.memo.toLowerCase().includes("repeated dataset"),
  );
  const expensivePayments = payments.filter((payment) => compareUsdc(payment.amount, "1500") > 0);
  const unusualProviders = new Set(
    payments
      .filter((payment) => payment.provider === "DeepInfra Labs")
      .map((payment) => payment.provider),
  );

  if (repeatedMemos.length >= 2) {
    risks.push({
      id: "risk_repeated_dataset",
      title: "Repeated dataset purchases",
      description: `Detected ${repeatedMemos.length} matching purchases in the current dataset`,
      severity: "High",
      category: "repeat",
    });
  }

  if (expensivePayments.length >= 2) {
    risks.push({
      id: "risk_price_spike",
      title: "Price spike detected",
      description: `${expensivePayments.length} payments exceeded the deterministic 1,500 USDC demo threshold`,
      severity: "Medium",
      category: "spike",
    });
  }

  if (unusualProviders.size > 0) {
    risks.push({
      id: "risk_unusual_provider",
      title: "Unusual provider",
      description: "New provider: DeepInfra Labs",
      severity: "Low",
      category: "provider",
    });
  }

  if (budgetUsed > 85) {
    risks.push({
      id: "risk_budget_pressure",
      title: "Budget pressure",
      description: "Current run is close to the assigned budget",
      severity: "Medium",
      category: "budget",
    });
  }

  return risks;
}

export function getRiskLevel(risks: RiskSignal[]): "Low" | "Medium" | "High" {
  if (risks.some((risk) => risk.severity === "High")) {
    return "High";
  }

  if (risks.some((risk) => risk.severity === "Medium")) {
    return "Medium";
  }

  return "Low";
}
import { compareUsdc } from "@/lib/domain/usdc";
