import type { UsdcAmount } from "@/lib/domain/usdc";
import type { CategorySummary, PaymentEvent, ProviderSummary, RiskSignal } from "@/types/payment";
import type { CfoReport } from "@/types/report";

export type AgentProfile = {
  wallet: string;
  displayName: string;
  network: "Arc Mainnet" | "Arc Testnet";
  budget: UsdcAmount;
  owner: string;
  dateRange: {
    from: string;
    to: string;
  };
};

export type TaskSummary = {
  id: string;
  name: string;
  amount: UsdcAmount;
  share: number;
  budget: UsdcAmount;
  paymentCount: number;
  status: "Within budget" | "Near limit" | "Over budget";
};

export type AgentMetrics = {
  totalSpend: UsdcAmount;
  paymentCount: number;
  averagePayment: UsdcAmount;
  budgetUsed: number;
  topCategory: string;
  riskLevel: "Low" | "Medium" | "High";
};

export type SpendActivityPoint = {
  label: string;
  bucketStart: string;
  amount: number;
  payments: number;
};

export type AgentSpendSummary = {
  analysis: {
    source: "demo" | "arc" | "workspace";
    isLive: boolean;
    calculatedAt: string;
    version: string;
  };
  profile: AgentProfile;
  metrics: AgentMetrics;
  activity: SpendActivityPoint[];
  payments: PaymentEvent[];
  providers: ProviderSummary[];
  categories: CategorySummary[];
  risks: RiskSignal[];
  tasks: TaskSummary[];
  report: CfoReport;
};
