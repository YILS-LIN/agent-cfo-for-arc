"use client";

import { useMemo, useState } from "react";
import { CircleDollarSign, Gauge, Pencil, Save, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { usdcToNumber } from "@/lib/domain/usdc";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

export function BudgetsPage({ summary }: { summary: AgentSpendSummary }) {
  const [budgets, setBudgets] = useState(() =>
    Object.fromEntries(summary.tasks.map((task) => [task.id, task.budget])),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [policyMessage, setPolicyMessage] = useState(
    "Demo monitoring rules are local to this page.",
  );
  const totalBudget = useMemo(
    () => Object.values(budgets).reduce((total, value) => total + Number(value), 0),
    [budgets],
  );
  const used = (usdcToNumber(summary.metrics.totalSpend) / totalBudget) * 100;

  function saveBudget(id: string) {
    const next = Number(draft);
    if (Number.isFinite(next) && next > 0) setBudgets((current) => ({ ...current, [id]: draft }));
    setEditing(null);
  }

  return (
    <AppShell
      title="Budgets & Guardrails"
      description="Set task limits before agents authorize paid resources"
      owner={summary.profile.owner}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Assigned budget"
          value={formatCurrency(totalBudget)}
          detail="Across all active tasks"
          icon={CircleDollarSign}
        />
        <SummaryStat
          label="Budget used"
          value={formatPercent(used)}
          detail={`${formatCurrency(summary.metrics.totalSpend)} settled`}
          icon={Gauge}
          tone={used > 80 ? "orange" : "green"}
        />
        <SummaryStat
          label="Monitoring policy"
          value={monitoringEnabled ? "Enabled" : "Disabled"}
          detail="Warns only; does not block onchain payments"
          icon={ShieldCheck}
          tone={monitoringEnabled ? "green" : "orange"}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <SectionCard
          title="Task budgets"
          description="Edit a limit to update projected utilization immediately."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="pb-3 font-semibold">Task</th>
                  <th className="pb-3 font-semibold">Used</th>
                  <th className="pb-3 font-semibold">Limit</th>
                  <th className="pb-3 font-semibold">Utilization</th>
                  <th className="pb-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {summary.tasks.map((task) => {
                  const limit = budgets[task.id] ?? task.budget;
                  const percent = (usdcToNumber(task.amount) / usdcToNumber(limit)) * 100;
                  const tone = percent >= 100 ? "red" : percent >= 80 ? "orange" : "blue";
                  return (
                    <tr key={task.id} className="border-b border-line/70 last:border-0">
                      <td className="py-3">
                        <p className="font-semibold">{task.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{task.id.replace("_", "-")}</p>
                      </td>
                      <td className="py-3 font-medium">{formatCurrency(task.amount)}</td>
                      <td className="py-3">
                        {editing === task.id ? (
                          <input
                            autoFocus
                            className={`${inputClassName} w-32`}
                            type="number"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                        ) : (
                          formatCurrency(limit)
                        )}
                      </td>
                      <td className="w-48 py-3">
                        <div className="mb-1 flex justify-between text-xs">
                          <span>{formatPercent(percent)}</span>
                          <span className="text-muted">
                            {percent >= 100 ? "Over limit" : "Available"}
                          </span>
                        </div>
                        <ProgressBar value={percent} tone={tone} />
                      </td>
                      <td className="py-3 text-right">
                        {editing === task.id ? (
                          <Button onClick={() => saveBudget(task.id)}>
                            <Save className="size-4" /> Save
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditing(task.id);
                              setDraft(String(limit));
                            }}
                          >
                            <Pencil className="size-4" /> Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard title="Payment policy" description={policyMessage}>
          <div className="grid gap-4">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white p-3">
              <span>
                <span className="block text-sm font-semibold">Monitor at 100%</span>
                <span className="mt-1 block text-xs text-muted">
                  Raise a risk signal when observed spend exceeds the limit.
                </span>
              </span>
              <input
                type="checkbox"
                checked={monitoringEnabled}
                onChange={(event) => setMonitoringEnabled(event.target.checked)}
                className="size-5 accent-blue"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Warning threshold</span>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min="50"
                  max="95"
                  defaultValue="80"
                  className="w-full accent-blue"
                />
                <span className="text-sm font-semibold">80%</span>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted">Single-payment review limit</span>
              <input
                className={`${inputClassName} mt-2 w-full`}
                type="number"
                defaultValue="1500"
              />
            </label>
            <Button
              onClick={() =>
                setPolicyMessage(
                  "Demo monitoring policy saved locally; no onchain enforcement is active.",
                )
              }
            >
              Save policy
            </Button>
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
