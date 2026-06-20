"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, CircleDollarSign, Search, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { ProviderMark } from "@/components/dashboard/provider-mark";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

export function ProvidersPage({ summary }: { summary: AgentSpendSummary }) {
  const [query, setQuery] = useState("");
  const [approved, setApproved] = useState(
    () => new Set(summary.providers.slice(0, 5).map((item) => item.provider)),
  );
  const providers = useMemo(
    () =>
      summary.providers.filter((provider) =>
        provider.provider.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, summary.providers],
  );
  const concentration = summary.providers
    .slice(0, 3)
    .reduce((total, provider) => total + provider.share, 0);

  function toggleApproval(provider: string) {
    setApproved((current) => {
      const next = new Set(current);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  }

  return (
    <AppShell
      title="Providers"
      description="Control which paid services autonomous agents can use"
      owner={summary.profile.owner}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Active providers"
          value={summary.providers.length.toString()}
          detail={`${approved.size} approved`}
          icon={Users}
        />
        <SummaryStat
          label="Top-3 concentration"
          value={formatPercent(concentration)}
          detail="Share of total spend"
          icon={CircleDollarSign}
          tone="orange"
        />
        <SummaryStat
          label="Policy coverage"
          value="100%"
          detail="Every provider has a trust state"
          icon={ShieldCheck}
          tone="green"
        />
      </div>
      <SectionCard
        title="Provider directory"
        description="Approval changes apply to future x402 payment requests."
      >
        <label className="relative mb-4 block max-w-md">
          <Search className="absolute left-3 top-3 size-4 text-muted" />
          <input
            className={`${inputClassName} w-full pl-9`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search providers"
          />
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          {providers.map((provider) => {
            const isApproved = approved.has(provider.provider);
            return (
              <article
                key={provider.provider}
                className="rounded-lg border border-line bg-white p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProviderMark provider={provider.provider} />
                    <div>
                      <h3 className="font-bold">{provider.provider}</h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {provider.paymentCount} x402 payments
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${isApproved ? "bg-green/10 text-green" : "bg-red/10 text-red"}`}
                  >
                    <CheckCircle2 className="size-3" />
                    {isApproved ? "Allowed in demo" : "Flagged in demo"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted">Total spend</p>
                    <p className="mt-1 text-lg font-semibold">{formatCurrency(provider.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Portfolio share</p>
                    <p className="mt-1 text-lg font-semibold">{formatPercent(provider.share)}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={provider.share}
                    tone={provider.share > 35 ? "orange" : "blue"}
                  />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <p className="text-xs text-muted">
                    Trust policy: {isApproved ? "payments allowed" : "manual review required"}
                  </p>
                  <Button variant="ghost" onClick={() => toggleApproval(provider.provider)}>
                    {isApproved ? "Flag" : "Allow"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </AppShell>
  );
}
