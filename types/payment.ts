import type { UsdcAmount } from "@/lib/domain/usdc";

export type SpendCategory = "APIs" | "Data" | "Models" | "Creator Content" | "Compute" | "Storage";

export type PaymentStatus = "completed" | "pending" | "failed";

export type PaymentEvent = {
  id: string;
  txHash: string;
  wallet: string;
  provider: string;
  providerLogo: string;
  payee: string;
  category: SpendCategory;
  taskId: string;
  taskName: string;
  amount: UsdcAmount;
  currency: "USDC";
  timestamp: string;
  status: PaymentStatus;
  memo: string;
  x402Resource: string;
  chainId: number;
  source: "demo" | "circle_gateway" | "arc";
  rawReference?: string;
};

export type ProviderSummary = {
  provider: string;
  providerLogo: string;
  amount: UsdcAmount;
  paymentCount: number;
  share: number;
};

export type CategorySummary = {
  category: SpendCategory;
  amount: UsdcAmount;
  share: number;
  paymentCount: number;
};

export type RiskSeverity = "High" | "Medium" | "Low";

export type RiskSignal = {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  category: "repeat" | "spike" | "provider" | "budget";
};
