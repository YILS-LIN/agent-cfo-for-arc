"use client";

import { useMemo, useState } from "react";
import { CircleDollarSign, Download, Filter, ReceiptText, Search, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import { ProviderMark } from "@/components/dashboard/provider-mark";
import { SectionCard, SummaryStat, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { ARC_TESTNET_EXPLORER, CIRCLE_GATEWAY_TESTNET_API } from "@/lib/arc/evidence-config";
import { compareUsdc, sumUsdc } from "@/lib/domain/usdc";
import { formatCurrency } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";
import type { PaymentEvent, SpendCategory } from "@/types/payment";

export function SpendPage({
  summary,
  payments,
}: {
  summary: AgentSpendSummary;
  payments: PaymentEvent[];
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | SpendCategory>("All");
  const [status, setStatus] = useState<"all" | PaymentEvent["status"]>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments.filter(
      (payment) =>
        (category === "All" || payment.category === category) &&
        (status === "all" || payment.status === status) &&
        (!needle ||
          [payment.provider, payment.taskName, payment.memo, payment.txHash].some((value) =>
            value.toLowerCase().includes(needle),
          )),
    );
  }, [category, payments, query, status]);

  const visibleSpend = sumUsdc(filtered.map((payment) => payment.amount));
  const largest = filtered.reduce(
    (current, payment) => (compareUsdc(payment.amount, current) > 0 ? payment.amount : current),
    "0",
  );

  function exportCsv() {
    const header = [
      "id",
      "timestamp",
      "provider",
      "category",
      "task",
      "amount",
      "status",
      "txHash",
    ];
    const rows = filtered.map((payment) => [
      payment.id,
      payment.timestamp,
      payment.provider,
      payment.category,
      payment.taskName,
      payment.amount,
      payment.status,
      payment.txHash,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "arc-agent-spend.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell
      title="Spend Ledger"
      description="Inspect and export every Arc x402 payment event"
      owner={summary.profile.owner}
      actions={
        <Button onClick={exportCsv}>
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Visible spend"
          value={formatCurrency(visibleSpend)}
          detail={`${filtered.length} matching transactions`}
          icon={CircleDollarSign}
        />
        <SummaryStat
          label="Largest payment"
          value={formatCurrency(largest)}
          detail="Within current filters"
          icon={TrendingUp}
          tone="orange"
        />
        <SummaryStat
          label="Ledger coverage"
          value="100%"
          detail="Deterministic demo events reconciled"
          icon={ReceiptText}
          tone="green"
        />
      </div>

      <SectionCard
        title="Transactions"
        description="Search by provider, task, memo, or transaction hash."
      >
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(240px,1fr)_180px_160px]">
          <label className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted" />
            <input
              className={`${inputClassName} w-full pl-9`}
              placeholder="Search spend ledger"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="relative">
            <Filter className="absolute left-3 top-3 size-4 text-muted" />
            <select
              className={`${inputClassName} w-full pl-9`}
              value={category}
              onChange={(event) => setCategory(event.target.value as "All" | SpendCategory)}
            >
              <option>All</option>
              {summary.categories.map((item) => (
                <option key={item.category}>{item.category}</option>
              ))}
            </select>
          </label>
          <select
            className={inputClassName}
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="pb-3 font-semibold">Provider</th>
                <th className="pb-3 font-semibold">Task</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Memo</th>
                <th className="pb-3 text-right font-semibold">Amount</th>
                <th className="pb-3 text-right font-semibold">Evidence</th>
                <th className="pb-3 text-right font-semibold">Settled</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((payment) => (
                <tr key={payment.id} className="border-b border-line/70 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2 font-semibold">
                      <ProviderMark provider={payment.provider} />
                      {payment.provider}
                    </div>
                  </td>
                  <td className="max-w-52 truncate py-3">{payment.taskName}</td>
                  <td className="py-3">
                    <span className="rounded bg-blue-soft px-2 py-1 text-xs font-semibold text-blue">
                      {payment.category}
                    </span>
                  </td>
                  <td className="max-w-64 truncate py-3 text-muted">{payment.memo}</td>
                  <td className="py-3 text-right font-semibold">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="py-3 text-right text-xs">
                    {payment.source === "demo" ? (
                      <span className="text-muted">Demo fixture</span>
                    ) : (
                      <span className="inline-flex gap-2">
                        {payment.rawReference && (
                          <a
                            className="font-semibold text-blue hover:underline"
                            href={`${CIRCLE_GATEWAY_TESTNET_API}/v1/x402/transfers/${payment.rawReference}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Circle ↗
                          </a>
                        )}
                        <a
                          className="font-semibold text-blue hover:underline"
                          href={`${ARC_TESTNET_EXPLORER}/tx/${payment.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Arc ↗
                        </a>
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-xs text-muted">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(payment.timestamp))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              No payment events match these filters.
            </p>
          )}
        </div>
      </SectionCard>
    </AppShell>
  );
}
