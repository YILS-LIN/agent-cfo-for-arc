import type { AuthContext } from "@/lib/auth/types";
import { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import type { AppDatabase } from "@/lib/db/database";
import {
  AuditRepository,
  ChainEventRepository,
  RepositoryNotFoundError,
  SyncLeaseUnavailableError,
  SyncRepository,
  WalletRepository,
} from "@/lib/db/repositories";
import type { PaymentSyncAdapter } from "@/lib/sync/types";

export class SyncPermissionError extends Error {}
export class SyncAdapterNotConfiguredError extends Error {}

export class WorkspaceSyncService {
  private readonly wallets: WalletRepository;
  private readonly cursors: SyncRepository;
  private readonly adapters: Map<PaymentSyncAdapter["source"], PaymentSyncAdapter>;

  constructor(
    private readonly database: AppDatabase,
    private readonly application: WorkspaceApplicationService,
    adapters: PaymentSyncAdapter[],
  ) {
    this.wallets = new WalletRepository(database);
    this.cursors = new SyncRepository(database);
    this.adapters = new Map(adapters.map((adapter) => [adapter.source, adapter]));
  }

  list(context: AuthContext) {
    return this.cursors.list(context);
  }

  async sync(
    context: AuthContext,
    input: { walletId: string; source: PaymentSyncAdapter["source"] },
  ) {
    if (context.role === "viewer") throw new SyncPermissionError("Viewer access is read-only");
    const wallet = await this.wallets.getById(context, input.walletId);
    if (!wallet) throw new RepositoryNotFoundError("Workspace wallet not found");
    const adapter = this.adapters.get(input.source);
    if (!adapter) {
      throw new SyncAdapterNotConfiguredError(`No ${input.source} sync adapter is configured`);
    }
    const lease = await this.cursors.acquire(context, {
      walletId: wallet.id,
      source: input.source,
    });
    if (!lease.leaseToken) throw new SyncLeaseUnavailableError("Wallet sync lease is invalid");
    const leaseToken = lease.leaseToken;

    try {
      await this.wallets.updateSyncState(context, wallet.id, { status: "syncing" });
      const batch = await adapter.sync({ wallet, cursor: lease.cursor });
      let created = 0;
      let replayed = 0;
      for (const payment of batch.payments) {
        const { chainEvent, ...paymentInput } = payment;
        const chainEventId = chainEvent
          ? (await new ChainEventRepository(this.database).ingest(chainEvent)).chainEvent.id
          : paymentInput.chainEventId;
        const result = await this.application.ingestPayment(
          context,
          { ...paymentInput, chainEventId, walletId: wallet.id, source: input.source },
          "system",
        );
        if (result.created) created += 1;
        else replayed += 1;
      }
      const completedStatus = batch.hasMore ? "partial" : "ready";
      const cursor = await this.database.transaction(async (transaction) => {
        const cursors = new SyncRepository(transaction);
        const wallets = new WalletRepository(transaction);
        const audits = new AuditRepository(transaction);
        const completed = await cursors.complete(context, {
          id: lease.id,
          leaseToken,
          cursor: batch.cursor,
          status: completedStatus,
        });
        await wallets.updateSyncState(context, wallet.id, {
          status: completedStatus,
          syncedAt: new Date(),
        });
        await audits.record(context, {
          actorUserId: context.userId,
          action: "wallet.sync_completed",
          entityType: "wallet",
          entityId: wallet.id,
          source: "web",
          payload: {
            source: input.source,
            created,
            replayed,
            cursor: batch.cursor,
            hasMore: Boolean(batch.hasMore),
          },
        });
        return completed;
      });
      return { cursor, created, replayed, hasMore: Boolean(batch.hasMore) };
    } catch (error) {
      await Promise.allSettled([
        this.cursors.fail(context, {
          id: lease.id,
          leaseToken,
          error: error instanceof Error ? error.message : "Unknown sync failure",
        }),
        this.wallets.updateSyncState(context, wallet.id, { status: "failed" }),
      ]);
      throw error;
    }
  }
}
