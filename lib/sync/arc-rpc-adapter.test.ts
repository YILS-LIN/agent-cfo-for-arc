import { describe, expect, it } from "vitest";
import type { Address, Hash } from "viem";

import { ARC_TESTNET_CHAIN_ID } from "@/lib/arc/evidence-config";
import {
  ARC_NATIVE_USDC_EMITTER,
  ArcRpcPaymentSyncAdapter,
  type ArcRpcSource,
  type ArcTransferLog,
} from "@/lib/sync/arc-rpc-adapter";
import { InvalidSyncCursorError, SyncSourceUnavailableError } from "@/lib/sync/errors";

const walletAddress = "0x1111111111111111111111111111111111111111" as Address;
const payeeAddress = "0x2222222222222222222222222222222222222222" as Address;

function hash(seed: number) {
  return `0x${seed.toString(16).padStart(64, "0")}` as Hash;
}

function transfer(
  blockNumber: bigint,
  value: bigint,
  overrides: Partial<ArcTransferLog> = {},
): ArcTransferLog {
  return {
    transactionHash: hash(Number(blockNumber)),
    logIndex: 0,
    blockNumber,
    blockHash: hash(Number(blockNumber) + 10_000),
    from: walletAddress,
    to: payeeAddress,
    value,
    ...overrides,
  };
}

class FakeArcRpc implements ArcRpcSource {
  chainId = ARC_TESTNET_CHAIN_ID;
  latestBlock = 100n;
  readonly calls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];

  constructor(readonly logs: ArcTransferLog[]) {}

  async getChainId() {
    return this.chainId;
  }

  async getBlockNumber() {
    return this.latestBlock;
  }

  async getOutgoingTransfers(input: { wallet: Address; fromBlock: bigint; toBlock: bigint }) {
    expect(input.wallet.toLowerCase()).toBe(walletAddress);
    this.calls.push({ fromBlock: input.fromBlock, toBlock: input.toBlock });
    return this.logs.filter(
      (log) => log.blockNumber >= input.fromBlock && log.blockNumber <= input.toBlock,
    );
  }

  async getBlockTimestamp(blockNumber: bigint) {
    return 1_780_000_000n + blockNumber;
  }
}

const wallet = {
  id: "11111111-1111-4111-8111-111111111111",
  address: walletAddress,
  normalizedAddress: walletAddress,
  chainId: ARC_TESTNET_CHAIN_ID,
};

describe("ArcRpcPaymentSyncAdapter", () => {
  it("scans recent blocks first and maps exact native USDC events", async () => {
    const rpc = new FakeArcRpc([transfer(90n, 1_500_000n * 1_000_000_000_000n)]);
    const adapter = new ArcRpcPaymentSyncAdapter({
      rpc,
      startBlock: 1n,
      chunkSize: 7n,
      maxBlocksPerRun: 20n,
    });

    const result = await adapter.sync({ wallet });
    expect(rpc.calls).toEqual([
      { fromBlock: 81n, toBlock: 87n },
      { fromBlock: 88n, toBlock: 94n },
      { fromBlock: 95n, toBlock: 100n },
    ]);
    expect(result).toMatchObject({ hasMore: true });
    expect(JSON.parse(result.cursor ?? "")).toMatchObject({
      coverageStartBlock: "81",
      backfillNextBlock: "80",
      forwardNextBlock: "101",
    });
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0]).toMatchObject({
      amount: "1.5",
      providerId: payeeAddress,
      providerName: "0x2222…2222",
      category: "Uncategorized",
      source: "arc",
      metadata: {
        emitter: ARC_NATIVE_USDC_EMITTER,
        blockNumber: "90",
        ordering: "90:0",
      },
      chainEvent: {
        chainId: ARC_TESTNET_CHAIN_ID,
        eventName: "Transfer",
        blockNumber: 90n,
      },
    });
  });

  it("allocates each later run to new blocks before backward history", async () => {
    const rpc = new FakeArcRpc([]);
    const adapter = new ArcRpcPaymentSyncAdapter({
      rpc,
      startBlock: 1n,
      chunkSize: 10n,
      maxBlocksPerRun: 20n,
    });
    const first = await adapter.sync({ wallet });
    rpc.calls.length = 0;
    rpc.latestBlock = 105n;

    const second = await adapter.sync({ wallet, cursor: first.cursor });
    expect(rpc.calls).toEqual([
      { fromBlock: 101n, toBlock: 105n },
      { fromBlock: 66n, toBlock: 75n },
      { fromBlock: 76n, toBlock: 80n },
    ]);
    expect(JSON.parse(second.cursor ?? "")).toMatchObject({
      coverageStartBlock: "66",
      backfillNextBlock: "65",
      forwardNextBlock: "106",
      latestObservedBlock: "105",
    });
  });

  it("finishes without a partial cursor when the configured history fits", async () => {
    const rpc = new FakeArcRpc([]);
    const result = await new ArcRpcPaymentSyncAdapter({
      rpc,
      startBlock: 90n,
      chunkSize: 10n,
      maxBlocksPerRun: 20n,
    }).sync({ wallet });
    expect(result.hasMore).toBe(false);
    expect(JSON.parse(result.cursor ?? "")).toMatchObject({
      coverageStartBlock: "90",
      backfillNextBlock: null,
      forwardNextBlock: "101",
    });
  });

  it("excludes burns and self-transfers from spend", async () => {
    const rpc = new FakeArcRpc([
      transfer(99n, 1_000_000_000_000n, {
        to: "0x0000000000000000000000000000000000000000",
      }),
      transfer(100n, 1_000_000_000_000n, { to: walletAddress, logIndex: 1 }),
    ]);
    const result = await new ArcRpcPaymentSyncAdapter({
      rpc,
      startBlock: 90n,
      chunkSize: 10n,
      maxBlocksPerRun: 20n,
    }).sync({ wallet });
    expect(result.payments).toEqual([]);
  });

  it("rejects precision loss, corrupted cursors, and unexpected chains", async () => {
    const precisionRpc = new FakeArcRpc([transfer(100n, 1n)]);
    await expect(
      new ArcRpcPaymentSyncAdapter({
        rpc: precisionRpc,
        startBlock: 90n,
        chunkSize: 10n,
        maxBlocksPerRun: 20n,
      }).sync({ wallet }),
    ).rejects.toThrow("cannot be represented at 6-decimal precision");

    const rpc = new FakeArcRpc([]);
    const adapter = new ArcRpcPaymentSyncAdapter({
      rpc,
      startBlock: 90n,
      chunkSize: 10n,
      maxBlocksPerRun: 20n,
    });
    await expect(adapter.sync({ wallet, cursor: "not-json" })).rejects.toBeInstanceOf(
      InvalidSyncCursorError,
    );
    rpc.chainId = 1;
    await expect(adapter.sync({ wallet })).rejects.toBeInstanceOf(SyncSourceUnavailableError);
  });
});
