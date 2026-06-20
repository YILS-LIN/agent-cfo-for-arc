"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, CalendarDays, Download, FileText, History, Sparkles } from "lucide-react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard, SummaryStat, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type ReportContent = {
  headline: string;
  executiveSummary: string;
  findings: Array<{ title: string; evidence: string; impact: string }>;
  recommendations: Array<{
    action: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  }>;
  caveats: string[];
};

type StoredReport = {
  id: string;
  status: "pending" | "completed" | "failed";
  title: string;
  content: ReportContent | null;
  provider: string | null;
  model: string | null;
  errorCode: string | null;
  generatedAt: string | null;
  createdAt: string;
};

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function ReportDocument({ content }: { content: ReportContent }) {
  return (
    <article className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue">CFO brief</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">{content.headline}</h2>
        <p className="mt-3 leading-7 text-muted">{content.executiveSummary}</p>
      </header>
      {content.findings.length > 0 && (
        <section>
          <h3 className="text-sm font-bold">Findings</h3>
          <div className="mt-3 grid gap-3">
            {content.findings.map((finding) => (
              <div
                key={`${finding.title}-${finding.evidence}`}
                className="rounded-lg border border-line bg-subtle p-4"
              >
                <p className="font-semibold">{finding.title}</p>
                <p className="mt-2 text-sm text-muted">{finding.evidence}</p>
                <p className="mt-2 text-sm">{finding.impact}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {content.recommendations.length > 0 && (
        <section>
          <h3 className="text-sm font-bold">Recommended actions</h3>
          <ol className="mt-3 space-y-3">
            {content.recommendations.map((recommendation) => (
              <li key={recommendation.action} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{recommendation.action}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                      recommendation.priority === "high"
                        ? "bg-red/10 text-red"
                        : recommendation.priority === "medium"
                          ? "bg-orange/10 text-orange"
                          : "bg-blue-soft text-blue",
                    )}
                  >
                    {recommendation.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{recommendation.rationale}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
      {content.caveats.length > 0 && (
        <section className="rounded-lg border border-orange/20 bg-orange/5 p-4">
          <h3 className="text-sm font-bold text-orange">Scope and caveats</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {content.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export function ReportsPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, apiFetch } = useWorkspaceSession();
  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [provider, setProvider] = useState<"local" | "openai">("local");
  const [rangeEnd, setRangeEnd] = useState(() => dateInputValue(new Date()));
  const [rangeStart, setRangeStart] = useState(() =>
    dateInputValue(new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000)),
  );
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState(
    "Demo report is generated locally from deterministic sample facts.",
  );

  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const visibleReports = useMemo(
    () => (persistentLoaded ? reports : []),
    [persistentLoaded, reports],
  );
  const selected = useMemo(
    () => visibleReports.find((report) => report.id === selectedId) ?? visibleReports[0] ?? null,
    [selectedId, visibleReports],
  );

  const loadReports = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const response = await apiFetch("/api/reports", { signal });
      if (!response.ok)
        throw new Error(await getApiErrorMessage(response, "Unable to load reports"));
      const payload = (await response.json()) as { reports: StoredReport[] };
      signal?.throwIfAborted();
      setReports(payload.reports);
      setSelectedId((current) => current ?? payload.reports[0]?.id ?? null);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        payload.reports.length
          ? "Showing persisted workspace reports."
          : "No reports have been generated for this workspace.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadReports(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setReports([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load reports");
      });
    return () => controller.abort();
  }, [loadReports, session, usingPersistentWorkspace]);

  async function generateReport() {
    if (!session || !canWrite) return;
    setGenerating(true);
    try {
      const response = await apiFetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          provider,
          rangeStart: `${rangeStart}T00:00:00.000Z`,
          rangeEnd: `${rangeEnd}T23:59:59.999Z`,
        }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to generate report"));
        return;
      }
      const payload = (await response.json()) as { report: StoredReport };
      await loadReports(session.workspaceId);
      setSelectedId(payload.report.id);
      setMessage(`${provider === "openai" ? "OpenAI" : "Local"} report generated and audited.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate report");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadReport() {
    if (!selected || selected.status !== "completed") return;
    setDownloading(true);
    try {
      const response = await apiFetch(`/api/reports/${selected.id}/pdf`);
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to export report PDF"));
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${selected.title.replace(/[^a-zA-Z0-9._-]+/g, "-") || "agent-cfo-report"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Report PDF exported from the persisted workspace record.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export report PDF");
    } finally {
      setDownloading(false);
    }
  }

  const demoContent: ReportContent = {
    headline: summary.report.headline,
    executiveSummary: summary.report.summary,
    findings: [
      {
        title: "Observed demo spend",
        evidence: `${summary.metrics.totalSpend} USDC across ${summary.metrics.paymentCount} sample payments.`,
        impact: `${summary.metrics.budgetUsed}% of the sample budget was used.`,
      },
    ],
    recommendations: [
      {
        action: summary.report.recommendation,
        rationale: "Deterministic recommendation derived from bundled sample facts.",
        priority: summary.metrics.riskLevel === "High" ? "high" : "medium",
      },
    ],
    caveats: [
      "This public preview uses bundled sample data and is not stored.",
      "It does not authorize or block payments.",
    ],
  };

  return (
    <AppShell
      title="Reports"
      description={
        usingPersistentWorkspace
          ? "Generate and review auditable workspace CFO briefs"
          : "Preview a deterministic CFO brief from sample data"
      }
      owner={summary.profile.owner}
    >
      <p className="rounded-lg border border-blue/20 bg-blue/5 px-4 py-3 text-sm font-medium text-blue">
        {message}
      </p>
      {usingPersistentWorkspace ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryStat
              label="Reports"
              value={visibleReports.length.toString()}
              detail="Tenant-scoped history"
              icon={FileText}
            />
            <SummaryStat
              label="Completed"
              value={visibleReports
                .filter((report) => report.status === "completed")
                .length.toString()}
              detail="Ready for review"
              icon={History}
              tone="green"
            />
            <SummaryStat
              label="AI reports"
              value={visibleReports
                .filter((report) => report.provider === "openai")
                .length.toString()}
              detail="Generated with workspace BYOK"
              icon={BrainCircuit}
              tone="orange"
            />
          </div>
          <SectionCard
            title="Generate report"
            description="Local generation is deterministic. OpenAI generation requires an encrypted workspace key."
            action={<Sparkles className="size-5 text-violet" />}
          >
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
              <label className="text-xs font-semibold text-muted">
                Provider
                <select
                  className={`${inputClassName} mt-2 w-full`}
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as "local" | "openai")}
                  disabled={!canWrite || generating}
                >
                  <option value="local">Local deterministic</option>
                  <option value="openai">OpenAI BYOK</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                From
                <input
                  className={`${inputClassName} mt-2 w-full`}
                  type="date"
                  value={rangeStart}
                  max={rangeEnd}
                  onChange={(event) => setRangeStart(event.target.value)}
                  disabled={!canWrite || generating}
                />
              </label>
              <label className="text-xs font-semibold text-muted">
                To
                <input
                  className={`${inputClassName} mt-2 w-full`}
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  disabled={!canWrite || generating}
                />
              </label>
              <Button
                onClick={() => void generateReport()}
                disabled={!canWrite || generating || !rangeStart || !rangeEnd}
              >
                {generating ? "Generating…" : "Generate"}
              </Button>
            </div>
            {!canWrite && (
              <p className="mt-3 text-xs text-muted">
                Viewer access can review reports but cannot generate them.
              </p>
            )}
          </SectionCard>
          <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
            <SectionCard
              title="History"
              description="Newest first"
              action={<CalendarDays className="size-5 text-blue" />}
            >
              {!persistentLoaded ? (
                <p className="text-sm text-muted">Loading report history…</p>
              ) : visibleReports.length === 0 ? (
                <p className="text-sm text-muted">
                  Generate the first report to begin an auditable history.
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleReports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedId(report.id)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left",
                        selected?.id === report.id
                          ? "border-blue bg-blue-soft"
                          : "border-line bg-white hover:border-blue/30",
                      )}
                    >
                      <span className="block text-sm font-semibold">{report.title}</span>
                      <span className="mt-1 block text-xs text-muted">
                        {report.provider} · {report.status} ·{" "}
                        {new Date(report.createdAt).toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard
              title={selected?.title ?? "Report detail"}
              description={
                selected ? `${selected.provider} · ${selected.model}` : "Select a completed report"
              }
              action={
                selected?.status === "completed" ? (
                  <Button
                    variant="ghost"
                    onClick={() => void downloadReport()}
                    disabled={downloading}
                  >
                    <Download className="size-4" /> {downloading ? "Exporting…" : "PDF"}
                  </Button>
                ) : undefined
              }
            >
              {selected?.status === "completed" && selected.content ? (
                <ReportDocument content={selected.content} />
              ) : selected?.status === "failed" ? (
                <p className="text-sm text-red">
                  Generation failed: {selected.errorCode ?? "unknown error"}
                </p>
              ) : selected ? (
                <p className="text-sm text-muted">Report generation is pending.</p>
              ) : (
                <p className="text-sm text-muted">No report selected.</p>
              )}
            </SectionCard>
          </div>
        </>
      ) : (
        <SectionCard
          title="Public demo report"
          description="Local preview · not persisted"
          action={<FileText className="size-5 text-blue" />}
        >
          <ReportDocument content={demoContent} />
        </SectionCard>
      )}
    </AppShell>
  );
}
