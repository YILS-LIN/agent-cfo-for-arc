"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clipboard, Plus, RefreshCw, Wallet, X } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { cn, compactAddress, formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type WalletRecord = {
  address: string;
  label: string;
  network: string;
  budget: number;
  spent: number;
  primary: boolean;
};

export function WalletsPage({ summary }: { summary: AgentSpendSummary }) {
  const [wallets, setWallets] = useState<WalletRecord[]>([
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
      network: "Arc Mainnet",
      budget: 12000,
      spent: 4872.15,
      primary: false,
    },
    {
      address: "0x70f7ca8d182eb130d43bd10d79a61ec70336f02e",
      label: "Sandbox Agent",
      network: "Arc Testnet",
      budget: 5000,
      spent: 934.2,
      primary: false,
    },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("All wallet telemetry is synchronized.");

  function addWallet() {
    if (!label.trim() || !address.trim().startsWith("0x")) {
      setMessage("Enter a label and a valid 0x wallet address.");
      return;
    }

    setWallets((current) => [
      ...current,
      {
        address: address.trim(),
        label: label.trim(),
        network: "Arc Mainnet",
        budget: 10000,
        spent: 0,
        primary: false,
      },
    ]);
    setLabel("");
    setAddress("");
    setShowForm(false);
    setMessage("Wallet added and queued for Arc telemetry sync.");
  }

  const totalBudget = wallets.reduce((total, wallet) => total + wallet.budget, 0);
  const totalSpent = wallets.reduce((total, wallet) => total + wallet.spent, 0);

  return (
    <AppShell
      title="Agent Wallets"
      description="Manage Arc accounts, budgets, and payment telemetry"
      owner={summary.profile.owner}
      actions={
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" /> Add wallet
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Connected wallets"
          value={wallets.length.toString()}
          detail="2 mainnet, 1 testnet"
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
          value={formatPercent((totalSpent / totalBudget) * 100)}
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
            <Button onClick={addWallet}>Connect</Button>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              aria-label="Cancel adding wallet"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Connected wallets"
        description={message}
        action={
          <button
            type="button"
            className="text-xs font-semibold text-blue"
            onClick={() => setMessage("Wallet telemetry refreshed just now.")}
          >
            Refresh all
          </button>
        }
      >
        <div className="grid gap-3">
          {wallets.map((wallet) => {
            const used = wallet.budget > 0 ? (wallet.spent / wallet.budget) * 100 : 0;
            return (
              <article
                key={wallet.address}
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
                  {!wallet.primary && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setWallets((current) =>
                          current.map((item) => ({
                            ...item,
                            primary: item.address === wallet.address,
                          })),
                        )
                      }
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
