"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Play, ShieldAlert } from "lucide-react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard, SummaryStat, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type RiskStatus = "open" | "investigating" | "resolved";
type RiskSeverity = "low" | "medium" | "high";

type PersistentRisk = {
  id: string;
  ruleId: string;
  severity: RiskSeverity;
  status: RiskStatus;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  version: number;
  detectedAt: string;
};

type RiskView = PersistentRisk & { demo: boolean };

function label(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

const severityClass: Record<RiskSeverity, string> = {
  high: "bg-red/10 text-red",
  medium: "bg-orange/10 text-orange",
  low: "bg-blue-soft text-blue",
};

export function RisksPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, signIn, apiFetch } = useWorkspaceSession();
  const [severity, setSeverity] = useState<"all" | RiskSeverity>("all");
  const [demoStates, setDemoStates] = useState<Record<string, RiskStatus>>(() =>
    Object.fromEntries(summary.risks.map((risk) => [risk.id, "open"])),
  );
  const [persistentRisks, setPersistentRisks] = useState<PersistentRisk[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState(
    "Demo signals are calculated from deterministic fixture facts.",
  );

  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const allRisks = useMemo<RiskView[]>(
    () =>
      usingPersistentWorkspace
        ? persistentLoaded
          ? persistentRisks.map((risk) => ({ ...risk, demo: false }))
          : []
        : summary.risks.map((risk) => ({
            id: risk.id,
            ruleId: risk.category,
            severity: risk.severity.toLowerCase() as RiskSeverity,
            status: demoStates[risk.id] ?? "open",
            title: risk.title,
            description: risk.description,
            evidence: { rule: risk.category },
            version: 1,
            detectedAt: summary.analysis.calculatedAt,
            demo: true,
          })),
    [
      demoStates,
      persistentLoaded,
      persistentRisks,
      summary.analysis.calculatedAt,
      summary.risks,
      usingPersistentWorkspace,
    ],
  );
  const risks = useMemo(
    () => allRisks.filter((risk) => severity === "all" || risk.severity === severity),
    [allRisks, severity],
  );
  const open = allRisks.filter((risk) => risk.status !== "resolved").length;

  const loadPersistentRisks = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const response = await apiFetch("/api/risks", { signal });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Unable to load workspace risks"));
      }
      const payload = (await response.json()) as { risks: PersistentRisk[] };
      signal?.throwIfAborted();
      setPersistentRisks(payload.risks);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        payload.risks.length
          ? "Signals are persisted with deterministic rule evidence and versioned review state."
          : "No signals yet. Run analysis after ingesting workspace payment events.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadPersistentRisks(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistentRisks([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load workspace risks");
      });
    return () => controller.abort();
  }, [loadPersistentRisks, session, usingPersistentWorkspace]);

  async function runAnalysis() {
    if (!session || !canWrite) return;
    setMutating(true);
    setMessage("Analyzing persisted payments and budget guardrails…");
    try {
      const response = await apiFetch("/api/risks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to run risk analysis"));
        return;
      }
      const result = (await response.json()) as {
        signals: PersistentRisk[];
        resolvedCount: number;
        replayed: boolean;
      };
      await loadPersistentRisks(session.workspaceId);
      setMessage(
        `${result.replayed ? "Reused" : "Created"} deterministic snapshot; ${result.signals.length} active fingerprints, ${result.resolvedCount} stale signals resolved.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to run risk analysis");
    } finally {
      setMutating(false);
    }
  }

  async function updateStatus(risk: RiskView, status: RiskStatus) {
    if (!usingPersistentWorkspace) {
      setDemoStates((current) => ({ ...current, [risk.id]: status }));
      return;
    }
    if (!session || !canWrite) return;
    setMutating(true);
    try {
      const response = await apiFetch(`/api/risks/${encodeURIComponent(risk.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedVersion: risk.version }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to update risk status"));
        await loadPersistentRisks(session.workspaceId);
        return;
      }
      await loadPersistentRisks(session.workspaceId);
      setMessage(`Risk signal moved to ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update risk status");
    } finally {
      setMutating(false);
    }
  }

  return (
    <AppShell
      title="Risk Center"
      description={
        usingPersistentWorkspace
          ? "Investigate reproducible signals from persisted financial facts"
          : "Explore deterministic demo anomalies and review states"
      }
      owner={summary.profile.owner}
      actions={
        mode === "persistent" && !authenticated ? (
          <Button onClick={signIn}>
            <Play className="size-4" /> Sign in to analyze
          </Button>
        ) : usingPersistentWorkspace ? (
          <Button onClick={() => void runAnalysis()} disabled={!canWrite || mutating}>
            <Play className="size-4" /> {mutating ? "Working…" : "Run analysis"}
          </Button>
        ) : (
          <Button
            onClick={() =>
              setDemoStates(Object.fromEntries(summary.risks.map((risk) => [risk.id, "resolved"])))
            }
          >
            <CheckCircle2 className="size-4" /> Resolve demo signals
          </Button>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Open signals"
          value={open.toString()}
          detail="Across payment and policy checks"
          icon={ShieldAlert}
          tone={open ? "red" : "green"}
        />
        <SummaryStat
          label="High severity"
          value={allRisks.filter((risk) => risk.severity === "high").length.toString()}
          detail="Requires immediate review"
          icon={AlertTriangle}
          tone="red"
        />
        <SummaryStat
          label="Detection coverage"
          value="4 rules"
          detail="Budget, repeat, velocity, relative spike"
          icon={Eye}
          tone="green"
        />
      </div>

      <SectionCard title="Risk signals" description={message}>
        <select
          className={`${inputClassName} mb-4 w-48`}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as typeof severity)}
        >
          <option value="all">All</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="grid gap-3">
          {usingPersistentWorkspace && !persistentLoaded && (
            <div className="h-28 animate-pulse rounded-lg border border-line bg-white" />
          )}
          {persistentLoaded && usingPersistentWorkspace && risks.length === 0 && (
            <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
              No risk signals match this view.
            </p>
          )}
          {risks.map((risk) => {
            const rule = typeof risk.evidence.rule === "string" ? risk.evidence.rule : risk.ruleId;
            return (
              <article
                key={risk.id}
                className="grid gap-4 rounded-lg border border-line bg-white p-4 lg:grid-cols-[44px_minmax(0,1fr)_140px_auto] lg:items-center"
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-lg",
                    severityClass[risk.severity],
                  )}
                >
                  <AlertTriangle className="size-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold">{risk.title}</h3>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold",
                        severityClass[risk.severity],
                      )}
                    >
                      {label(risk.severity)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{risk.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    Rule: {rule} · {risk.demo ? "Demo facts" : "Persisted evidence"}
                  </p>
                </div>
                <select
                  className={inputClassName}
                  value={risk.status}
                  disabled={!canWrite || mutating}
                  onChange={(event) => void updateStatus(risk, event.target.value as RiskStatus)}
                >
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                </select>
                <Button
                  variant="ghost"
                  disabled={!canWrite || mutating}
                  onClick={() =>
                    void updateStatus(risk, risk.status === "resolved" ? "open" : "resolved")
                  }
                >
                  {risk.status === "resolved" ? "Reopen" : "Resolve"}
                </Button>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </AppShell>
  );
}
