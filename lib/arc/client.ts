import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

export type ArcSpendAdapter = {
  getAgentSummary: (wallet: string) => Promise<AgentSpendSummary>;
  ingestPayment: (payment: PaymentEvent) => Promise<{ accepted: boolean; payment: PaymentEvent }>;
};

export const demoArcAdapter: ArcSpendAdapter = {
  async getAgentSummary(wallet: string) {
    return buildAgentSpendSummary({ wallet });
  },
  async ingestPayment(payment: PaymentEvent) {
    return {
      accepted: true,
      payment,
    };
  },
};
