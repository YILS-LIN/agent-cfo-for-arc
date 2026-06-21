import { createHash } from "node:crypto";

import { VERIFIED_EVIDENCE_WALLET } from "@/lib/arc/evidence-config";
import { getPublicArcEvidencePayments } from "@/lib/arc/public-evidence";
import { SyncSourceUnavailableError } from "@/lib/sync/errors";
import type { PaymentSyncAdapter } from "@/lib/sync/types";

export { SyncSourceUnavailableError } from "@/lib/sync/errors";

export class PublicCircleEvidenceSyncAdapter implements PaymentSyncAdapter {
  readonly source = "circle_gateway" as const;

  async sync({ wallet }: Parameters<PaymentSyncAdapter["sync"]>[0]) {
    if (wallet.normalizedAddress !== VERIFIED_EVIDENCE_WALLET) {
      throw new SyncSourceUnavailableError(
        "Circle settlement discovery is unavailable for this wallet; ingest x402 settlement references through the authenticated ledger API",
      );
    }
    const evidence = await getPublicArcEvidencePayments();
    const payments = evidence.map((payment) => ({
      walletId: wallet.id,
      externalId: payment.rawReference ?? payment.id,
      transactionHash: payment.txHash,
      amount: payment.amount,
      providerName: payment.provider,
      category: payment.category,
      resourceUri: payment.x402Resource,
      occurredAt: new Date(payment.timestamp),
      source: "circle_gateway" as const,
      rawReference: payment.rawReference,
      metadata: {
        payee: payment.payee,
        memo: payment.memo,
        evidence: "public_circle_gateway_arc_batch",
      },
    }));
    const cursor = createHash("sha256")
      .update(
        payments
          .map((payment) => payment.externalId)
          .sort()
          .join("\n"),
      )
      .digest("hex");
    return { payments, cursor };
  }
}
