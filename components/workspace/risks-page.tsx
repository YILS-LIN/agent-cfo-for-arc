"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, ShieldAlert } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import { SectionCard, SummaryStat, inputClassName } from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";
import type { RiskSeverity } from "@/types/payment";

type RiskState = "Open" | "Investigating" | "Resolved";

export function RisksPage({ summary }: { summary: AgentSpendSummary }) {
  const [severity, setSeverity] = useState<"All" | RiskSeverity>("All");
  const [states, setStates] = useState<Record<string, RiskState>>(() =>
    Object.fromEntries(summary.risks.map((risk) => [risk.id, "Open"])),
  );
  const risks = useMemo(
    () => summary.risks.filter((risk) => severity === "All" || risk.severity === severity),
    [severity, summary.risks],
  );
  const open = Object.values(states).filter((state) => state !== "Resolved").length;

  const severityClass = {
    High: "bg-red/10 text-red",
    Medium: "bg-orange/10 text-orange",
    Low: "bg-blue-soft text-blue",
  };

  return (
    <AppShell
      title="Risk Center"
      description="Investigate anomalies before they become agent overspend"
      owner={summary.profile.owner}
      actions={
        <Button
          onClick={() =>
            setStates(Object.fromEntries(summary.risks.map((risk) => [risk.id, "Resolved"])))
          }
        >
          <CheckCircle2 className="size-4" /> Resolve all
        </Button>
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
          value={summary.risks.filter((risk) => risk.severity === "High").length.toString()}
          detail="Requires immediate review"
          icon={AlertTriangle}
          tone="red"
        />
        <SummaryStat
          label="Detection coverage"
          value="4 rules"
          detail="Repeat, spike, provider, budget"
          icon={Eye}
          tone="green"
        />
      </div>
      <SectionCard
        title="Risk signals"
        description="Move a signal through investigation and resolution."
      >
        <select
          className={`${inputClassName} mb-4 w-48`}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as typeof severity)}
        >
          <option>All</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <div className="grid gap-3">
          {risks.map((risk) => {
            const state = states[risk.id];
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
                      {risk.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{risk.description}</p>
                  <p className="mt-2 text-xs text-muted">
                    Rule: {risk.category} · Detected from deterministic demo facts
                  </p>
                </div>
                <select
                  className={inputClassName}
                  value={state}
                  onChange={(event) =>
                    setStates((current) => ({
                      ...current,
                      [risk.id]: event.target.value as RiskState,
                    }))
                  }
                >
                  <option>Open</option>
                  <option>Investigating</option>
                  <option>Resolved</option>
                </select>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setStates((current) => ({
                      ...current,
                      [risk.id]: state === "Resolved" ? "Open" : "Resolved",
                    }))
                  }
                >
                  {state === "Resolved" ? "Reopen" : "Resolve"}
                </Button>
              </article>
            );
          })}
        </div>
      </SectionCard>
    </AppShell>
  );
}
