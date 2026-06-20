import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARC_TESTNET_CHAIN_ID,
  VERIFIED_EVIDENCE_BATCH_TX,
  VERIFIED_EVIDENCE_SELLER,
  VERIFIED_EVIDENCE_WALLET,
} from "@/lib/arc/evidence-config";
import { getPublicArcEvidenceSummary } from "@/lib/arc/public-evidence";

afterEach(() => vi.unstubAllGlobals());

describe("public Arc evidence adapter", () => {
  it("reconciles Circle settlements only after the Arc batch is verified", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("rpc.testnet.arc.network")) {
        return Response.json({
          result: {
            hash: VERIFIED_EVIDENCE_BATCH_TX,
            chainId: `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`,
            blockNumber: "0x1",
            to: "0x0077777d7eba4688bdef3e311b846f25870a19b9",
          },
        });
      }

      const id = url.split("/").at(-1) ?? "missing";
      return Response.json({
        id,
        status: "completed",
        token: "USDC",
        sendingNetwork: `eip155:${ARC_TESTNET_CHAIN_ID}`,
        recipientNetwork: `eip155:${ARC_TESTNET_CHAIN_ID}`,
        fromAddress: VERIFIED_EVIDENCE_WALLET,
        toAddress: VERIFIED_EVIDENCE_SELLER,
        amount: "10000",
        createdAt: "2026-05-13T14:12:18.637Z",
        updatedAt: "2026-05-13T14:23:03.192Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const summary = await getPublicArcEvidenceSummary();

    expect(summary.analysis).toMatchObject({ source: "arc", isLive: true });
    expect(summary.metrics).toMatchObject({
      totalSpend: "0.02",
      paymentCount: 2,
      averagePayment: "0.01",
    });
    expect(summary.payments.every((payment) => payment.source === "circle_gateway")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
