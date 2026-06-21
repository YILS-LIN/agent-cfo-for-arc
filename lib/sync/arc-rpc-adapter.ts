import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  parseAbiItem,
  type Address,
  type Hash,
} from "viem";
import { z } from "zod";

import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_EXPLORER,
  ARC_TESTNET_RPC,
} from "@/lib/arc/evidence-config";
import { formatUsdcUnits } from "@/lib/domain/usdc";
import { InvalidSyncCursorError, SyncSourceUnavailableError } from "@/lib/sync/errors";
import type { PaymentSyncAdapter, SyncWallet } from "@/lib/sync/types";

export const ARC_NATIVE_USDC_EMITTER = "0xfffffffffffffffffffffffffffffffffffffffe" as const;
export const ARC_NATIVE_USDC_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;
export const ARC_TESTNET_ZERO5_BLOCK = 44_295_021n;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NATIVE_TO_USDC_SCALE = 1_000_000_000_000n;
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const cursorSchema = z.object({
  version: z.literal(1),
  targetStartBlock: z.string().regex(/^\d+$/),
  coverageStartBlock: z.string().regex(/^\d+$/),
  backfillNextBlock: z.string().regex(/^\d+$/).nullable(),
  forwardNextBlock: z.string().regex(/^\d+$/),
  latestObservedBlock: z.string().regex(/^\d+$/),
});

type ArcCursor = z.infer<typeof cursorSchema>;

export type ArcTransferLog = {
  transactionHash: Hash;
  logIndex: number;
  blockNumber: bigint;
  blockHash?: Hash;
  from: Address;
  to: Address;
  value: bigint;
};

export type ArcRpcSource = {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getOutgoingTransfers(input: {
    wallet: Address;
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<ArcTransferLog[]>;
  getBlockTimestamp(blockNumber: bigint): Promise<bigint>;
};

type BlockRange = { fromBlock: bigint; toBlock: bigint };

type ArcRpcAdapterOptions = {
  rpc?: ArcRpcSource;
  rpcUrl?: string;
  startBlock?: bigint;
  chunkSize?: bigint;
  maxBlocksPerRun?: bigint;
  rpcConcurrency?: number;
};

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: { default: { name: "Arcscan", url: ARC_TESTNET_EXPLORER } },
  testnet: true,
});

function envBigInt(name: string, fallback: bigint, minimum: bigint, maximum: bigint) {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a non-negative integer`);
  const value = BigInt(raw);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function compactAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function encodeCursor(cursor: ArcCursor) {
  return JSON.stringify(cursor);
}

function decodeCursor(raw: string | null | undefined): ArcCursor | null {
  if (!raw) return null;
  try {
    const cursor = cursorSchema.parse(JSON.parse(raw));
    const target = BigInt(cursor.targetStartBlock);
    const coverage = BigInt(cursor.coverageStartBlock);
    const backfill = cursor.backfillNextBlock ? BigInt(cursor.backfillNextBlock) : null;
    const forward = BigInt(cursor.forwardNextBlock);
    const latest = BigInt(cursor.latestObservedBlock);
    if (
      target > coverage ||
      coverage > latest ||
      forward > latest + 1n ||
      (backfill === null && coverage !== target) ||
      (backfill !== null && (backfill < target || backfill + 1n !== coverage))
    ) {
      throw new Error("Arc cursor invariants are invalid");
    }
    return cursor;
  } catch {
    throw new InvalidSyncCursorError("Stored Arc sync cursor is invalid");
  }
}

function splitRange(range: BlockRange, chunkSize: bigint) {
  const chunks: BlockRange[] = [];
  for (let fromBlock = range.fromBlock; fromBlock <= range.toBlock; fromBlock += chunkSize) {
    chunks.push({
      fromBlock,
      toBlock:
        fromBlock + chunkSize - 1n < range.toBlock ? fromBlock + chunkSize - 1n : range.toBlock,
    });
  }
  return chunks;
}

export class ViemArcRpcSource implements ArcRpcSource {
  private readonly client;

  constructor(rpcUrl: string) {
    this.client = createPublicClient({
      chain: arcTestnet,
      transport: http(rpcUrl, { timeout: 10_000, retryCount: 2, retryDelay: 500 }),
    });
  }

  getChainId() {
    return this.client.getChainId();
  }

  getBlockNumber() {
    return this.client.getBlockNumber({ cacheTime: 0 });
  }

  async getOutgoingTransfers(input: { wallet: Address; fromBlock: bigint; toBlock: bigint }) {
    const logs = await this.client.getLogs({
      address: ARC_NATIVE_USDC_EMITTER,
      event: transferEvent,
      args: { from: input.wallet },
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      strict: true,
    });
    return logs.map((log) => ({
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      from: log.args.from,
      to: log.args.to,
      value: log.args.value,
    }));
  }

  async getBlockTimestamp(blockNumber: bigint) {
    return (await this.client.getBlock({ blockNumber, includeTransactions: false })).timestamp;
  }
}

export class ArcRpcPaymentSyncAdapter implements PaymentSyncAdapter {
  readonly source = "arc" as const;
  private readonly rpc: ArcRpcSource;
  private readonly startBlock: bigint;
  private readonly chunkSize: bigint;
  private readonly maxBlocksPerRun: bigint;
  private readonly rpcConcurrency: number;

  constructor(options: ArcRpcAdapterOptions = {}) {
    this.rpc =
      options.rpc ??
      new ViemArcRpcSource(options.rpcUrl ?? process.env.ARC_TESTNET_RPC_URL ?? ARC_TESTNET_RPC);
    this.startBlock =
      options.startBlock ??
      envBigInt(
        "ARC_SYNC_START_BLOCK",
        ARC_TESTNET_ZERO5_BLOCK,
        ARC_TESTNET_ZERO5_BLOCK,
        10_000_000_000n,
      );
    this.chunkSize = options.chunkSize ?? envBigInt("ARC_SYNC_CHUNK_SIZE", 1_000n, 1n, 10_000n);
    this.maxBlocksPerRun =
      options.maxBlocksPerRun ?? envBigInt("ARC_SYNC_MAX_BLOCKS_PER_RUN", 20_000n, 1n, 100_000n);
    this.rpcConcurrency =
      options.rpcConcurrency ?? Number(envBigInt("ARC_SYNC_RPC_CONCURRENCY", 4n, 1n, 10n));
    if (this.maxBlocksPerRun < this.chunkSize) {
      throw new Error("ARC_SYNC_MAX_BLOCKS_PER_RUN must be at least ARC_SYNC_CHUNK_SIZE");
    }
    if (
      !Number.isInteger(this.rpcConcurrency) ||
      this.rpcConcurrency < 1 ||
      this.rpcConcurrency > 10
    ) {
      throw new Error("ARC sync RPC concurrency must be an integer between 1 and 10");
    }
  }

  async sync({ wallet, cursor: rawCursor }: { wallet: SyncWallet; cursor?: string | null }) {
    if (wallet.chainId !== ARC_TESTNET_CHAIN_ID) {
      throw new SyncSourceUnavailableError(
        `Arc RPC sync requires chain ID ${ARC_TESTNET_CHAIN_ID}`,
      );
    }

    let walletAddress: Address;
    try {
      walletAddress = getAddress(wallet.normalizedAddress);
    } catch {
      throw new SyncSourceUnavailableError("Wallet address is not a valid EVM address");
    }

    try {
      const [rpcChainId, latestBlock] = await Promise.all([
        this.rpc.getChainId(),
        this.rpc.getBlockNumber(),
      ]);
      if (rpcChainId !== ARC_TESTNET_CHAIN_ID) {
        throw new SyncSourceUnavailableError("Configured Arc RPC returned an unexpected chain ID");
      }
      if (this.startBlock > latestBlock) {
        throw new SyncSourceUnavailableError(
          "Configured Arc sync start block is ahead of the current chain head",
        );
      }

      const cursor = decodeCursor(rawCursor);
      const plan = this.planRanges(cursor, latestBlock);
      const logs: ArcTransferLog[] = [];
      for (const range of plan.ranges) {
        const chunks = splitRange(range, this.chunkSize);
        for (let index = 0; index < chunks.length; index += this.rpcConcurrency) {
          const responses = await Promise.all(
            chunks
              .slice(index, index + this.rpcConcurrency)
              .map((chunk) => this.rpc.getOutgoingTransfers({ wallet: walletAddress, ...chunk })),
          );
          logs.push(...responses.flat());
        }
      }
      logs.sort(
        (left, right) =>
          Number(left.blockNumber - right.blockNumber) || left.logIndex - right.logIndex,
      );

      const timestampByBlock = new Map<bigint, bigint>();
      await Promise.all(
        [...new Set(logs.map((log) => log.blockNumber))].map(async (blockNumber) => {
          timestampByBlock.set(blockNumber, await this.rpc.getBlockTimestamp(blockNumber));
        }),
      );

      const seen = new Set<string>();
      const payments = logs.flatMap((log) => {
        const identity = `${log.transactionHash.toLowerCase()}:${log.logIndex}`;
        if (seen.has(identity)) return [];
        seen.add(identity);
        if (
          log.value <= 0n ||
          log.to.toLowerCase() === ZERO_ADDRESS ||
          log.to.toLowerCase() === walletAddress.toLowerCase()
        ) {
          return [];
        }
        if (log.value % NATIVE_TO_USDC_SCALE !== 0n) {
          throw new SyncSourceUnavailableError(
            `Arc native USDC event ${identity} cannot be represented at 6-decimal precision`,
          );
        }
        const timestamp = timestampByBlock.get(log.blockNumber);
        if (timestamp === undefined) {
          throw new SyncSourceUnavailableError(`Arc block ${log.blockNumber} timestamp is missing`);
        }
        const amount = formatUsdcUnits(log.value / NATIVE_TO_USDC_SCALE);
        const occurredAt = new Date(Number(timestamp) * 1_000);
        const payee = getAddress(log.to);
        const externalId = `${ARC_TESTNET_CHAIN_ID}:${log.transactionHash.toLowerCase()}:${log.logIndex}`;
        const payload = {
          from: walletAddress.toLowerCase(),
          to: payee.toLowerCase(),
          value: log.value.toString(),
          decimals: 18,
        };
        return [
          {
            walletId: wallet.id,
            externalId,
            transactionHash: log.transactionHash.toLowerCase(),
            amount,
            providerId: payee.toLowerCase(),
            providerName: compactAddress(payee),
            category: "Uncategorized",
            occurredAt,
            source: "arc" as const,
            rawReference: `arc:${log.blockNumber}:${log.transactionHash.toLowerCase()}:${log.logIndex}`,
            metadata: {
              payee: payee.toLowerCase(),
              blockNumber: log.blockNumber.toString(),
              logIndex: log.logIndex,
              emitter: ARC_NATIVE_USDC_EMITTER,
              event: "Transfer",
              nativeDecimals: 18,
              ordering: `${log.blockNumber}:${log.logIndex}`,
            },
            chainEvent: {
              chainId: ARC_TESTNET_CHAIN_ID,
              transactionHash: log.transactionHash.toLowerCase(),
              eventIndex: log.logIndex,
              blockNumber: log.blockNumber,
              blockHash: log.blockHash?.toLowerCase(),
              contractAddress: ARC_NATIVE_USDC_EMITTER,
              eventName: "Transfer",
              payload,
              occurredAt,
            },
          },
        ];
      });

      return {
        payments,
        cursor: encodeCursor(plan.nextCursor),
        hasMore: plan.hasMore,
      };
    } catch (error) {
      if (error instanceof SyncSourceUnavailableError || error instanceof InvalidSyncCursorError) {
        throw error;
      }
      throw new SyncSourceUnavailableError(
        `Arc RPC synchronization failed: ${error instanceof Error ? error.message : "unknown RPC error"}`,
      );
    }
  }

  private planRanges(cursor: ArcCursor | null, latestBlock: bigint) {
    if (!cursor) {
      const fromBlock =
        latestBlock - this.startBlock + 1n > this.maxBlocksPerRun
          ? latestBlock - this.maxBlocksPerRun + 1n
          : this.startBlock;
      const backfillNextBlock = fromBlock > this.startBlock ? fromBlock - 1n : null;
      return {
        ranges: [{ fromBlock, toBlock: latestBlock }],
        hasMore: backfillNextBlock !== null,
        nextCursor: {
          version: 1 as const,
          targetStartBlock: this.startBlock.toString(),
          coverageStartBlock: fromBlock.toString(),
          backfillNextBlock: backfillNextBlock?.toString() ?? null,
          forwardNextBlock: (latestBlock + 1n).toString(),
          latestObservedBlock: latestBlock.toString(),
        },
      };
    }

    const targetStartBlock = BigInt(cursor.targetStartBlock);
    let coverageStartBlock = BigInt(cursor.coverageStartBlock);
    let backfillNextBlock = cursor.backfillNextBlock ? BigInt(cursor.backfillNextBlock) : null;
    let forwardNextBlock = BigInt(cursor.forwardNextBlock);
    let remaining = this.maxBlocksPerRun;
    const ranges: BlockRange[] = [];

    if (forwardNextBlock <= latestBlock && remaining > 0n) {
      const toBlock =
        forwardNextBlock + remaining - 1n < latestBlock
          ? forwardNextBlock + remaining - 1n
          : latestBlock;
      ranges.push({ fromBlock: forwardNextBlock, toBlock });
      remaining -= toBlock - forwardNextBlock + 1n;
      forwardNextBlock = toBlock + 1n;
    }

    if (backfillNextBlock !== null && backfillNextBlock >= targetStartBlock && remaining > 0n) {
      const fromBlock =
        backfillNextBlock - targetStartBlock + 1n > remaining
          ? backfillNextBlock - remaining + 1n
          : targetStartBlock;
      ranges.push({ fromBlock, toBlock: backfillNextBlock });
      coverageStartBlock = fromBlock;
      backfillNextBlock = fromBlock > targetStartBlock ? fromBlock - 1n : null;
    }

    return {
      ranges,
      hasMore: forwardNextBlock <= latestBlock || backfillNextBlock !== null,
      nextCursor: {
        version: 1 as const,
        targetStartBlock: targetStartBlock.toString(),
        coverageStartBlock: coverageStartBlock.toString(),
        backfillNextBlock: backfillNextBlock?.toString() ?? null,
        forwardNextBlock: forwardNextBlock.toString(),
        latestObservedBlock: latestBlock.toString(),
      },
    };
  }
}
