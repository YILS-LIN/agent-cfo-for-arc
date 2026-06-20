import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import { VERIFIED_EVIDENCE_WALLET } from "@/lib/arc/evidence-config";
import { getPublicArcEvidenceSummary } from "@/lib/arc/public-evidence";
import { DEMO_WALLET } from "@/lib/demo/mock-payments";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

export type PaymentIngestResult = {
  accepted: boolean;
  persisted: boolean;
  mode: "demo" | "live";
  payment: PaymentEvent;
};

export type ArcSpendAdapter = {
  getAgentSummary: (wallet: string) => Promise<AgentSpendSummary>;
  ingestPayment: (payment: PaymentEvent) => Promise<PaymentIngestResult>;
};

export class LiveArcAdapterUnavailableError extends Error {}

export const demoArcAdapter: ArcSpendAdapter = {
  async getAgentSummary(wallet: string) {
    if (wallet.toLowerCase() !== DEMO_WALLET.toLowerCase()) {
      throw new LiveArcAdapterUnavailableError(
        "Live Arc wallet analysis is not configured yet. Run the deterministic demo wallet instead.",
      );
    }

    return buildAgentSpendSummary({ wallet: DEMO_WALLET });
  },
  async ingestPayment(payment: PaymentEvent) {
    return {
      accepted: false,
      persisted: false,
      mode: "demo",
      payment,
    };
  },
};

export const arcSpendAdapter: ArcSpendAdapter = {
  async getAgentSummary(wallet: string) {
    if (wallet.toLowerCase() === VERIFIED_EVIDENCE_WALLET) {
      return getPublicArcEvidenceSummary();
    }

    return demoArcAdapter.getAgentSummary(wallet);
  },
  ingestPayment: demoArcAdapter.ingestPayment,
};
