import { expect, it } from "vitest";

import { ARC_TESTNET_RPC } from "@/lib/arc/evidence-config";
import {
  ArcRpcPaymentSyncAdapter,
  ViemArcRpcSource,
  type ArcRpcSource,
} from "@/lib/sync/arc-rpc-adapter";

const runLive = process.env.ARC_LIVE_TEST === "1" ? it : it.skip;
const evidenceBlock = 47_932_672n;
const evidenceWallet = "0x5794a8284a29493871fbfa3c4f343d42001424d6" as const;
const evidenceTransaction = "0xb4beb0d0130ebba4cd934a6e8062784e8896bd46781df7fcd0459dc0aa0670b6";

runLive(
  "reads and maps a deterministic native USDC transfer from Arc Testnet",
  async () => {
    const live = new ViemArcRpcSource(ARC_TESTNET_RPC);
    const logs = await live.getOutgoingTransfers({
      wallet: evidenceWallet,
      fromBlock: evidenceBlock,
      toBlock: evidenceBlock,
    });
    expect(logs.some((log) => log.transactionHash === evidenceTransaction)).toBe(true);

    const boundedRpc: ArcRpcSource = {
      getChainId: () => live.getChainId(),
      getBlockNumber: async () => evidenceBlock,
      getOutgoingTransfers: (input) => live.getOutgoingTransfers(input),
      getBlockTimestamp: (blockNumber) => live.getBlockTimestamp(blockNumber),
    };
    const result = await new ArcRpcPaymentSyncAdapter({
      rpc: boundedRpc,
      startBlock: evidenceBlock,
      chunkSize: 1n,
      maxBlocksPerRun: 1n,
    }).sync({
      wallet: {
        id: "11111111-1111-4111-8111-111111111111",
        address: evidenceWallet,
        normalizedAddress: evidenceWallet,
        chainId: 5_042_002,
      },
    });
    expect(result.hasMore).toBe(false);
    expect(result.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transactionHash: evidenceTransaction,
          amount: "5.956898",
          source: "arc",
          chainEvent: expect.objectContaining({ blockNumber: evidenceBlock }),
        }),
      ]),
    );
  },
  30_000,
);
