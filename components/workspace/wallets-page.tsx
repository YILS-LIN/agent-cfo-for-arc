"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, Clipboard, Plus, RefreshCw, Wallet, X } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/client/api";
import { usdcToNumber, type UsdcAmount } from "@/lib/domain/usdc";
import { cn, compactAddress, formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type WalletRecord = {
  id?: string;
  address: string;
  label: string;
  network: string;
  budget: UsdcAmount;
  spent: UsdcAmount;
  primary: boolean;
  syncStatus?: "idle" | "syncing" | "ready" | "partial" | "failed";
  syncDetail?: string;
};

type PersistentWallet = {
  id: string;
  address: string;
  chainId: number;
  label: string;
  isPrimary: boolean;
};

type PersistentSyncCursor = {
  walletId: string;
  source: "arc" | "circle_gateway" | "x402" | "demo";
  status: "idle" | "syncing" | "ready" | "partial" | "failed";
  lastError?: string | null;
  lastSucceededAt?: string | null;
};

type PersistentWalletMetric = {
  id: string;
  spent: UsdcAmount;
  assignedBudget: UsdcAmount;
  paymentCount: number;
  budgetUsed: number;
};

function toWalletRecord(
  wallet: PersistentWallet,
  cursor?: PersistentSyncCursor,
  metric?: PersistentWalletMetric,
): WalletRecord {
  return {
    id: wallet.id,
    address: wallet.address,
    label: wallet.label,
    network: wallet.chainId === 5_042_002 ? "Arc Testnet" : `Chain ${wallet.chainId}`,
    budget: metric?.assignedBudget ?? "0",
    spent: metric?.spent ?? "0",
    primary: wallet.isPrimary,
    syncStatus: cursor?.status ?? "idle",
    syncDetail:
      cursor?.status === "failed"
        ? (cursor.lastError ?? "Last sync failed")
        : cursor?.lastSucceededAt
          ? `Last synced ${new Date(cursor.lastSucceededAt).toLocaleString()}`
          : "No completed sync",
  };
}

export function WalletsPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, signIn, apiFetch } = useWorkspaceSession();
  const [demoWallets, setDemoWallets] = useState<WalletRecord[]>([
    {
      address: summary.profile.wallet,
      label: summary.profile.displayName,
      network: summary.profile.network,
      budget: summary.profile.budget,
      spent: summary.metrics.totalSpend,
      primary: true,
    },
    {
      address: "0x4a91d8e8b2017c63b534aa89d4f213729e2fd702",
      label: "Procurement Agent",
      network: "Arc Testnet · Demo",
      budget: "12000",
      spent: "4872.15",
      primary: false,
    },
    {
      address: "0x70f7ca8d182eb130d43bd10d79a61ec70336f02e",
      label: "Sandbox Agent",
      network: "Arc Testnet",
      budget: "5000",
      spent: "934.2",
      primary: false,
    },
  ]);
  const [persistentWallets, setPersistentWallets] = useState<WalletRecord[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [mutating, setMutating] = useState(false);
  const [syncingWalletId, setSyncingWalletId] = useState<string | null>(null);
  const [message, setMessage] = useState("Demo wallet records are held in browser memory only.");
  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const wallets = usingPersistentWorkspace
    ? persistentLoaded
      ? persistentWallets
      : []
    : demoWallets;
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");

  const loadPersistentWallets = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const [walletsResponse, syncResponse, summaryResponse] = await Promise.all([
        apiFetch("/api/wallets", { signal }),
        apiFetch("/api/sync", { signal }),
        apiFetch("/api/analytics/summary", { signal }),
      ]);
      for (const response of [walletsResponse, syncResponse, summaryResponse]) {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Unable to load workspace wallets"));
        }
      }
      const payload = (await walletsResponse.json()) as { wallets: PersistentWallet[] };
      const syncPayload = (await syncResponse.json()) as { cursors: PersistentSyncCursor[] };
      const summaryPayload = (await summaryResponse.json()) as {
        wallets: PersistentWalletMetric[];
      };
      signal?.throwIfAborted();
      setPersistentWallets(
        payload.wallets.map((wallet) =>
          toWalletRecord(
            wallet,
            syncPayload.cursors.find(
              (cursor) => cursor.walletId === wallet.id && cursor.source === "circle_gateway",
            ),
            summaryPayload.wallets.find((metric) => metric.id === wallet.id),
          ),
        ),
      );
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        payload.wallets.length
          ? "Wallets are persisted with leased Circle synchronization status."
          : "No persistent wallets yet. Connect the first Arc wallet for this workspace.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadPersistentWallets(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistentWallets([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load workspace wallets");
      });
    return () => {
      controller.abort();
    };
  }, [loadPersistentWallets, session, usingPersistentWorkspace]);

  async function addWallet() {
    if (!label.trim() || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
      setMessage("Enter a label and a valid 0x wallet address.");
      return;
    }

    if (usingPersistentWorkspace) {
      if (!canWrite) {
        setMessage("Viewer access is read-only.");
        return;
      }
      if (!session) return;
      setMutating(true);
      try {
        const response = await apiFetch("/api/wallets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            address: address.trim(),
            chainId: 5_042_002,
            source: "manual",
            label: label.trim(),
            isPrimary: persistentWallets.length === 0,
            ownershipStatus: "unverified",
            capabilities: {
              observable: true,
              ownershipVerified: false,
              userSignable: false,
              agentExecutable: false,
              policyEnforceable: false,
            },
          }),
        });
        if (!response.ok) {
          setMessage(await getApiErrorMessage(response, "Unable to connect wallet"));
          return;
        }
        await loadPersistentWallets(session.workspaceId);
        setMessage("Wallet connected to the persistent workspace.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to connect wallet");
        return;
      } finally {
        setMutating(false);
      }
    } else {
      setDemoWallets((current) => [
        ...current,
        {
          address: address.trim(),
          label: label.trim(),
          network: "Arc Testnet · Demo",
          budget: "10000",
          spent: "0",
          primary: false,
        },
      ]);
      setMessage("Demo wallet added locally; live Arc synchronization is not configured.");
    }
    setLabel("");
    setAddress("");
    setShowForm(false);
  }

  async function setPrimary(wallet: WalletRecord) {
    if (!usingPersistentWorkspace) {
      setDemoWallets((current) =>
        current.map((item) => ({ ...item, primary: item.address === wallet.address })),
      );
      return;
    }
    if (!wallet.id || !canWrite || !session) return;
    setMutating(true);
    try {
      const response = await apiFetch(`/api/wallets/${encodeURIComponent(wallet.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to set primary wallet"));
        return;
      }
      await loadPersistentWallets(session.workspaceId);
      setMessage(`${wallet.label} is now the primary workspace wallet.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to set primary wallet");
    } finally {
      setMutating(false);
    }
  }

  async function syncWallet(wallet: WalletRecord) {
    if (!wallet.id || !session || !canWrite || !usingPersistentWorkspace) return;
    setMutating(true);
    setSyncingWalletId(wallet.id);
    setMessage(`Synchronizing verified Circle evidence for ${wallet.label}…`);
    try {
      const response = await apiFetch(`/api/wallets/${encodeURIComponent(wallet.id)}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "circle_gateway" }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to synchronize wallet"));
        await loadPersistentWallets(session.workspaceId);
        return;
      }
      const result = (await response.json()) as { created: number; replayed: number };
      await loadPersistentWallets(session.workspaceId);
      setMessage(
        `Circle sync completed: ${result.created} new and ${result.replayed} existing events reconciled.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to synchronize wallet");
    } finally {
      setMutating(false);
      setSyncingWalletId(null);
    }
  }

  const totalBudget = wallets.reduce((total, wallet) => total + usdcToNumber(wallet.budget), 0);
  const totalSpent = wallets.reduce((total, wallet) => total + usdcToNumber(wallet.spent), 0);
  const utilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <AppShell
      title="Agent Wallets"
      description={
        usingPersistentWorkspace
          ? "Manage workspace wallets with tenant-safe persistence"
          : "Explore the public demo or sign in to manage persistent wallets"
      }
      owner={summary.profile.owner}
      actions={
        mode === "persistent" && !authenticated ? (
          <Button onClick={signIn}>
            <Plus className="size-4" /> Sign in to manage
          </Button>
        ) : (
          <Button onClick={() => setShowForm(true)} disabled={!canWrite}>
            <Plus className="size-4" /> Add wallet
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label={usingPersistentWorkspace ? "Workspace wallets" : "Demo wallets"}
          value={wallets.length.toString()}
          detail={usingPersistentWorkspace ? "Tenant-scoped records" : "Deterministic demo records"}
          icon={Wallet}
        />
        <SummaryStat
          label="Combined spend"
          value={formatCurrency(totalSpent)}
          detail="Across all active agents"
          icon={RefreshCw}
          tone="green"
        />
        <SummaryStat
          label="Budget utilization"
          value={formatPercent(utilization)}
          detail={`${formatCurrency(totalBudget)} assigned`}
          icon={Check}
          tone="orange"
        />
      </div>

      {showForm && (
        <SectionCard
          title="Connect an agent wallet"
          description="The wallet will be monitored for x402 USDC payment events."
        >
          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto_auto]">
            <input
              className={inputClassName}
              placeholder="Wallet label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <input
              className={inputClassName}
              placeholder="0x wallet address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Button onClick={() => void addWallet()} disabled={mutating}>
              {mutating ? "Connecting…" : "Connect"}
            </Button>
            <Button
              variant="ghost"
              disabled={mutating}
              onClick={() => setShowForm(false)}
              aria-label="Cancel adding wallet"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={usingPersistentWorkspace ? "Workspace wallets" : "Demo wallets"}
        description={message}
        action={
          <button
            type="button"
            className="text-xs font-semibold text-blue"
            onClick={() => {
              if (usingPersistentWorkspace) {
                if (session) {
                  void loadPersistentWallets(session.workspaceId).catch((error: unknown) =>
                    setMessage(
                      error instanceof Error ? error.message : "Unable to refresh wallets",
                    ),
                  );
                }
              } else {
                setMessage("Demo records refreshed from the local fixture.");
              }
            }}
          >
            Refresh all
          </button>
        }
      >
        <div className="grid gap-3">
          {usingPersistentWorkspace && !persistentLoaded && (
            <div className="h-24 animate-pulse rounded-lg border border-line bg-white" />
          )}
          {persistentLoaded && usingPersistentWorkspace && wallets.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
              No wallets are connected to this workspace yet.
            </p>
          )}
          {wallets.map((wallet) => {
            const budget = usdcToNumber(wallet.budget);
            const used = budget > 0 ? (usdcToNumber(wallet.spent) / budget) * 100 : 0;
            return (
              <article
                key={wallet.id ?? wallet.address}
                className="grid gap-4 rounded-lg border border-line bg-white p-4 lg:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_auto] lg:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-blue">
                    <Wallet className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold">{wallet.label}</h3>
                      {wallet.primary && (
                        <span className="rounded bg-green/10 px-1.5 py-0.5 text-[10px] font-bold text-green">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mt-1 flex items-center gap-1 text-xs text-muted"
                      onClick={() => navigator.clipboard?.writeText(wallet.address)}
                    >
                      {compactAddress(wallet.address)} <Clipboard className="size-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted">Network</p>
                  <p className="mt-1 text-sm font-semibold">{wallet.network}</p>
                  {usingPersistentWorkspace && (
                    <p
                      className={cn(
                        "mt-1 text-[11px] capitalize",
                        wallet.syncStatus === "failed" ? "text-red" : "text-muted",
                      )}
                      title={wallet.syncDetail}
                    >
                      Sync: {wallet.syncStatus}
                    </p>
                  )}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted">Budget</span>
                    <span className="font-semibold">{formatPercent(used)}</span>
                  </div>
                  <ProgressBar value={used} tone={used > 80 ? "orange" : "blue"} />
                  <p className="mt-1 text-[11px] text-muted">
                    {formatCurrency(wallet.spent)} / {formatCurrency(wallet.budget)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {usingPersistentWorkspace && (
                    <Button
                      variant="ghost"
                      disabled={!canWrite || mutating}
                      onClick={() => void syncWallet(wallet)}
                    >
                      <RefreshCw
                        className={cn("size-4", syncingWalletId === wallet.id && "animate-spin")}
                      />{" "}
                      Sync
                    </Button>
                  )}
                  {!wallet.primary && (
                    <Button
                      variant="ghost"
                      disabled={!canWrite || mutating}
                      onClick={() => void setPrimary(wallet)}
                    >
                      Set primary
                    </Button>
                  )}
                  <Link
                    href={`/?wallet=${encodeURIComponent(wallet.address)}`}
                    className={cn(
                      "inline-flex h-10 items-center rounded-lg bg-blue-soft px-4 text-sm font-semibold text-blue",
                    )}
                  >
                    Analyze
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </AppShell>
  );
}
