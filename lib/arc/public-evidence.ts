import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC,
  CIRCLE_GATEWAY_TESTNET_API,
  VERIFIED_EVIDENCE_BATCH_TX,
  VERIFIED_EVIDENCE_SELLER,
  VERIFIED_EVIDENCE_SETTLEMENT_IDS,
  VERIFIED_EVIDENCE_WALLET,
} from "@/lib/arc/evidence-config";
import { formatUsdcUnits } from "@/lib/domain/usdc";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent } from "@/types/payment";

type CircleSettlement = {
  id: string;
  status: "completed" | "confirmed" | string;
  token: string;
  sendingNetwork: string;
  recipientNetwork: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type RpcTransaction = {
  hash: string;
  chainId: string;
  blockNumber: string | null;
  to: string | null;
};

async function fetchSettlement(id: string): Promise<CircleSettlement> {
  const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/x402/transfers/${id}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Circle Gateway settlement lookup failed with ${response.status}`);
  }

  return (await response.json()) as CircleSettlement;
}

async function verifyBatchTransaction(): Promise<RpcTransaction> {
  const response = await fetch(ARC_TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getTransactionByHash",
      params: [VERIFIED_EVIDENCE_BATCH_TX],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Arc RPC lookup failed with ${response.status}`);
  }

  const envelope = (await response.json()) as { result?: RpcTransaction | null };
  if (!envelope.result?.blockNumber || envelope.result.hash !== VERIFIED_EVIDENCE_BATCH_TX) {
    throw new Error("Pinned Arc batch transaction could not be verified");
  }
  if (Number.parseInt(envelope.result.chainId, 16) !== ARC_TESTNET_CHAIN_ID) {
    throw new Error("Pinned transaction is not on the expected Arc Testnet chain");
  }

  return envelope.result;
}

function settlementToPayment(settlement: CircleSettlement): PaymentEvent {
  if (
    settlement.token !== "USDC" ||
    settlement.status !== "completed" ||
    settlement.sendingNetwork !== `eip155:${ARC_TESTNET_CHAIN_ID}` ||
    settlement.fromAddress.toLowerCase() !== VERIFIED_EVIDENCE_WALLET ||
    settlement.toAddress.toLowerCase() !== VERIFIED_EVIDENCE_SELLER
  ) {
    throw new Error(`Settlement ${settlement.id} does not match the verified evidence boundary`);
  }

  return {
    id: `circle_${settlement.id}`,
    txHash: VERIFIED_EVIDENCE_BATCH_TX,
    wallet: settlement.fromAddress,
    provider: "Circle x402 Demo Seller",
    providerLogo: "C",
    payee: settlement.toAddress,
    category: "APIs",
    taskId: "task_verified_x402",
    taskName: "Verified x402 hello-world purchases",
    amount: formatUsdcUnits(BigInt(settlement.amount)),
    currency: "USDC",
    timestamp: settlement.createdAt,
    status: "completed",
    memo: "Public Circle Gateway x402 settlement verified against an Arc Testnet batch",
    x402Resource: "/hello-world",
    chainId: ARC_TESTNET_CHAIN_ID,
    source: "circle_gateway",
    rawReference: settlement.id,
  };
}

export async function getPublicArcEvidenceSummary(): Promise<AgentSpendSummary> {
  const [, settlements] = await Promise.all([
    verifyBatchTransaction(),
    Promise.all(VERIFIED_EVIDENCE_SETTLEMENT_IDS.map(fetchSettlement)),
  ]);
  const payments = settlements.map(settlementToPayment);

  return buildAgentSpendSummary({
    wallet: VERIFIED_EVIDENCE_WALLET,
    payments,
    source: "arc",
    profile: {
      displayName: "Verified Circle x402 Buyer",
      network: "Arc Testnet",
      budget: "0.05",
      owner: "Public evidence",
      dateRange: {
        from: payments.at(-1)?.timestamp.slice(0, 10) ?? "2026-05-13",
        to: payments[0]?.timestamp.slice(0, 10) ?? "2026-05-13",
      },
    },
  });
}
