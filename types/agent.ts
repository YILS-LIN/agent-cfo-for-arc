import type { CategorySummary, PaymentEvent, ProviderSummary, RiskSignal } from "@/types/payment";
import type { CfoReport } from "@/types/report";

export type AgentProfile = {
  wallet: string;
  displayName: string;
  network: "Arc Mainnet" | "Arc Testnet";
  budget: number;
  owner: string;
  dateRange: {
    from: string;
    to: string;
  };
};

export type TaskSummary = {
  id: string;
  name: string;
  amount: number;
  share: number;
  budget: number;
  paymentCount: number;
  status: "Within budget" | "Near limit" | "Over budget";
};

export type AgentMetrics = {
  totalSpend: number;
  paymentCount: number;
  averagePayment: number;
  budgetUsed: number;
  topCategory: string;
  riskLevel: "Low" | "Medium" | "High";
};

export type AgentSpendSummary = {
  profile: AgentProfile;
  metrics: AgentMetrics;
  payments: PaymentEvent[];
  providers: ProviderSummary[];
  categories: CategorySummary[];
  risks: RiskSignal[];
  tasks: TaskSummary[];
  report: CfoReport;
};
