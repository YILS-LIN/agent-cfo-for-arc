"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { ProviderMark } from "@/components/dashboard/provider-mark";
import { getApiErrorMessage } from "@/lib/client/api";
import type { UsdcAmount } from "@/lib/domain/usdc";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type PolicyDecision = "allowed" | "review" | "blocked";

type ProviderMetric = {
  id: string;
  name: string;
  spent: UsdcAmount;
  paymentCount: number;
  share: number;
};

type ProviderPolicy = {
  providerKey: string;
  displayName: string;
  decision: PolicyDecision;
  version: number;
};

type ProviderView = ProviderMetric & {
  decision: PolicyDecision;
  version: number;
  demo: boolean;
};

const decisionClass: Record<PolicyDecision, string> = {
  allowed: "bg-green/10 text-green",
  review: "bg-orange/10 text-orange",
  blocked: "bg-red/10 text-red",
};

export function ProvidersPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, apiFetch } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [demoDecisions, setDemoDecisions] = useState<Record<string, PolicyDecision>>(() =>
    Object.fromEntries(
      summary.providers.map((provider, index) => [
        provider.provider,
        index < 5 ? "allowed" : "review",
      ]),
    ),
  );
  const [persistentProviders, setPersistentProviders] = useState<ProviderMetric[]>([]);
  const [policies, setPolicies] = useState<ProviderPolicy[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [mutatingKey, setMutatingKey] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "Demo review states are local and do not enforce payment authorization.",
  );

  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const allProviders = useMemo<ProviderView[]>(
    () =>
      usingPersistentWorkspace
        ? persistentLoaded
          ? persistentProviders.map((provider) => {
              const policy = policies.find((item) => item.providerKey === provider.id);
              return {
                ...provider,
                decision: policy?.decision ?? "review",
                version: policy?.version ?? 0,
                demo: false,
              };
            })
          : []
        : summary.providers.map((provider) => ({
            id: provider.provider,
            name: provider.provider,
            spent: provider.amount,
            paymentCount: provider.paymentCount,
            share: provider.share,
            decision: demoDecisions[provider.provider] ?? "review",
            version: 0,
            demo: true,
          })),
    [
      demoDecisions,
      persistentLoaded,
      persistentProviders,
      policies,
      summary.providers,
      usingPersistentWorkspace,
    ],
  );
  const providers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allProviders.filter((provider) => provider.name.toLowerCase().includes(needle));
  }, [allProviders, query]);
  const concentration = allProviders
    .slice(0, 3)
    .reduce((total, provider) => total + provider.share, 0);
  const policyCoverage = allProviders.length
    ? (allProviders.filter((provider) => provider.version > 0 || provider.demo).length /
        allProviders.length) *
      100
    : 0;

  const loadPersistentProviders = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const [summaryResponse, policyResponse] = await Promise.all([
        apiFetch("/api/analytics/summary", { signal }),
        apiFetch("/api/providers", { signal }),
      ]);
      for (const response of [summaryResponse, policyResponse]) {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Unable to load providers"));
        }
      }
      const summaryPayload = (await summaryResponse.json()) as { providers: ProviderMetric[] };
      const policyPayload = (await policyResponse.json()) as { policies: ProviderPolicy[] };
      signal?.throwIfAborted();
      setPersistentProviders(summaryPayload.providers);
      setPolicies(policyPayload.policies);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        summaryPayload.providers.length
          ? "Decisions are persisted for review and alerts; wallet-level enforcement is not active."
          : "No paid providers have been observed in this workspace.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadPersistentProviders(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistentProviders([]);
        setPolicies([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load providers");
      });
    return () => controller.abort();
  }, [loadPersistentProviders, session, usingPersistentWorkspace]);

  async function setDecision(provider: ProviderView, decision: PolicyDecision) {
    if (!usingPersistentWorkspace) {
      setDemoDecisions((current) => ({ ...current, [provider.id]: decision }));
      return;
    }
    if (!session || !canWrite) return;
    setMutatingKey(provider.id);
    try {
      const response = await apiFetch(`/api/providers/${encodeURIComponent(provider.id)}/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: provider.name,
          decision,
          expectedVersion: provider.version,
        }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to update provider policy"));
        await loadPersistentProviders(session.workspaceId);
        return;
      }
      await loadPersistentProviders(session.workspaceId);
      setMessage(
        `${provider.name} marked ${decision}. This review state does not block onchain payments.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update provider policy");
    } finally {
      setMutatingKey(null);
    }
  }

  return (
    <AppShell
      title="Providers"
      description={
        usingPersistentWorkspace
          ? "Review paid-service concentration and workspace trust decisions"
          : "Explore demo service concentration and review states"
      }
      owner={summary.profile.owner}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Active providers"
          value={allProviders.length.toString()}
          detail={`${allProviders.filter((provider) => provider.decision === "allowed").length} allowed`}
          icon={Users}
        />
        <SummaryStat
          label="Top-3 concentration"
          value={formatPercent(concentration)}
          detail="Share of observed spend"
          icon={CircleDollarSign}
          tone="orange"
        />
        <SummaryStat
          label="Policy coverage"
          value={formatPercent(policyCoverage)}
          detail="Explicitly reviewed active providers"
          icon={ShieldCheck}
          tone={policyCoverage === 100 ? "green" : "orange"}
        />
      </div>

      <SectionCard title="Provider directory" description={message}>
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
          {usingPersistentWorkspace && !persistentLoaded && (
            <div className="h-48 animate-pulse rounded-lg border border-line bg-white" />
          )}
          {persistentLoaded && usingPersistentWorkspace && providers.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted lg:col-span-2">
              No providers match this view.
            </p>
          )}
          {providers.map((provider) => (
            <article key={provider.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderMark provider={provider.name} />
                  <div>
                    <h3 className="font-bold">{provider.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {provider.paymentCount} observed payments
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${decisionClass[provider.decision]}`}
                >
                  {provider.decision === "allowed" ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <AlertCircle className="size-3" />
                  )}
                  {provider.decision}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted">Total spend</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(provider.spent)}</p>
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
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
                <p className="text-xs text-muted">Review metadata only; no wallet enforcement.</p>
                <select
                  className={`${inputClassName} w-32`}
                  value={provider.decision}
                  disabled={!canWrite || mutatingKey === provider.id}
                  onChange={(event) =>
                    void setDecision(provider, event.target.value as PolicyDecision)
                  }
                  aria-label={`Policy for ${provider.name}`}
                >
                  <option value="allowed">Allowed</option>
                  <option value="review">Review</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
