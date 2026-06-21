import type { IngestChainEventInput, IngestPaymentInput } from "@/lib/db/validation";

export type SyncWallet = {
  id: string;
  address: string;
  normalizedAddress: string;
  chainId: number;
};

export type PaymentSyncAdapter = {
  source: "arc" | "circle_gateway" | "x402";
  sync(input: { wallet: SyncWallet; cursor?: string | null }): Promise<{
    payments: Array<IngestPaymentInput & { chainEvent?: IngestChainEventInput }>;
    cursor?: string;
    hasMore?: boolean;
  }>;
};
