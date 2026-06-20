"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Gauge, Pencil, Plus, Save, ShieldCheck, X } from "lucide-react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";
import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/client/api";
import { usdcToNumber, type UsdcAmount } from "@/lib/domain/usdc";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type PersistentBudget = {
  id: string;
  walletId?: string | null;
  taskId?: string | null;
  providerId?: string | null;
  periodType: "task" | "daily" | "weekly" | "monthly" | "custom";
  periodStart: string;
  periodEnd: string;
  amount: UsdcAmount;
  warningThreshold: string;
  hardLimitRequested: boolean;
  status: "active" | "paused" | "archived";
  version: number;
};

type BudgetRow = {
  id: string;
  name: string;
  detail: string;
  used: UsdcAmount;
  limit: UsdcAmount;
  version?: number;
  status?: PersistentBudget["status"];
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowInput() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function persistentBudgetRow(budget: PersistentBudget): BudgetRow {
  const scope = budget.taskId
    ? `Task ${budget.taskId.slice(0, 8)}`
    : budget.walletId
      ? `Wallet ${budget.walletId.slice(0, 8)}`
      : budget.providerId
        ? `Provider ${budget.providerId}`
        : "Workspace";
  return {
    id: budget.id,
    name: `${scope} · ${budget.periodType}`,
    detail: `${budget.periodStart.slice(0, 10)} → ${budget.periodEnd.slice(0, 10)}`,
    used: "0",
    limit: budget.amount,
    version: budget.version,
    status: budget.status,
  };
}

export function BudgetsPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, signIn, apiFetch } = useWorkspaceSession();
  const [demoBudgets, setDemoBudgets] = useState(() =>
    Object.fromEntries(summary.tasks.map((task) => [task.id, task.budget])),
  );
  const [persistentBudgets, setPersistentBudgets] = useState<PersistentBudget[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [periodType, setPeriodType] = useState<PersistentBudget["periodType"]>("daily");
  const [periodStart, setPeriodStart] = useState(todayInput);
  const [periodEnd, setPeriodEnd] = useState(tomorrowInput);
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState("Demo monitoring rules are local to this page.");

  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const rows = useMemo<BudgetRow[]>(
    () =>
      usingPersistentWorkspace
        ? persistentLoaded
          ? persistentBudgets.map(persistentBudgetRow)
          : []
        : summary.tasks.map((task) => ({
            id: task.id,
            name: task.name,
            detail: task.id.replace("_", "-"),
            used: task.amount,
            limit: demoBudgets[task.id] ?? task.budget,
          })),
    [demoBudgets, persistentBudgets, persistentLoaded, summary.tasks, usingPersistentWorkspace],
  );

  const totalBudget = useMemo(
    () => rows.reduce((total, row) => total + usdcToNumber(row.limit), 0),
    [rows],
  );
  const totalSpend = useMemo(
    () => rows.reduce((total, row) => total + usdcToNumber(row.used), 0),
    [rows],
  );
  const used = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;

  const loadPersistentBudgets = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const response = await apiFetch("/api/budgets", { signal });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Unable to load workspace budgets"));
      }
      const payload = (await response.json()) as { budgets: PersistentBudget[] };
      signal?.throwIfAborted();
      setPersistentBudgets(payload.budgets);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        payload.budgets.length
          ? "Budget changes are persisted and protected by optimistic locking."
          : "No persistent budgets yet. Create the first workspace guardrail.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadPersistentBudgets(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistentBudgets([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load workspace budgets");
      });
    return () => controller.abort();
  }, [loadPersistentBudgets, session, usingPersistentWorkspace]);

  async function saveBudget(row: BudgetRow) {
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(draft) || usdcToNumber(draft) <= 0) {
      setMessage("Enter a positive USDC amount with no more than six decimal places.");
      return;
    }
    if (!usingPersistentWorkspace) {
      setDemoBudgets((current) => ({ ...current, [row.id]: draft }));
      setEditing(null);
      setMessage("Demo task budget updated locally.");
      return;
    }
    if (!session || !row.version || !canWrite) return;
    setMutating(true);
    try {
      const response = await apiFetch(`/api/budgets/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: draft, expectedVersion: row.version }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to update budget"));
        return;
      }
      await loadPersistentBudgets(session.workspaceId);
      setEditing(null);
      setMessage("Budget amount updated and audited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update budget");
    } finally {
      setMutating(false);
    }
  }

  async function createBudget() {
    if (!session || !canWrite) return;
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amount) || usdcToNumber(amount) <= 0) {
      setMessage("Enter a positive USDC amount with no more than six decimal places.");
      return;
    }
    const start = new Date(`${periodStart}T00:00:00.000Z`);
    const end = new Date(`${periodEnd}T00:00:00.000Z`);
    if (!periodStart || !periodEnd || end <= start) {
      setMessage("Budget end date must be after its start date.");
      return;
    }
    setMutating(true);
    try {
      const response = await apiFetch("/api/budgets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          periodType,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
          amount,
          warningThreshold,
          hardLimitRequested: false,
        }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to create budget"));
        return;
      }
      await loadPersistentBudgets(session.workspaceId);
      setAmount("");
      setShowForm(false);
      setMessage("Workspace budget created and audited.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create budget");
    } finally {
      setMutating(false);
    }
  }

  return (
    <AppShell
      title="Budgets & Guardrails"
      description={
        usingPersistentWorkspace
          ? "Set tenant-safe USDC limits with audited, conflict-safe updates"
          : "Explore demo limits or sign in to manage persistent guardrails"
      }
      owner={summary.profile.owner}
      actions={
        mode === "persistent" && !authenticated ? (
          <Button onClick={signIn}>
            <Plus className="size-4" /> Sign in to manage
          </Button>
        ) : usingPersistentWorkspace ? (
          <Button onClick={() => setShowForm(true)} disabled={!canWrite}>
            <Plus className="size-4" /> Add budget
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Assigned budget"
          value={formatCurrency(totalBudget)}
          detail={usingPersistentWorkspace ? "Across active workspace limits" : "Across demo tasks"}
          icon={CircleDollarSign}
        />
        <SummaryStat
          label="Budget used"
          value={formatPercent(used)}
          detail={`${formatCurrency(totalSpend)} observed`}
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

      {showForm && usingPersistentWorkspace && (
        <SectionCard
          title="Create a workspace budget"
          description="Dates use UTC boundaries; enforcement remains observational until a managed wallet policy is connected."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[150px_1fr_1fr_140px_auto_auto]">
            <select
              className={inputClassName}
              value={periodType}
              onChange={(event) => setPeriodType(event.target.value as typeof periodType)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
            </select>
            <input
              className={inputClassName}
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
              aria-label="Budget start date"
            />
            <input
              className={inputClassName}
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
              aria-label="Budget end date"
            />
            <input
              className={inputClassName}
              inputMode="decimal"
              placeholder="USDC limit"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <Button onClick={() => void createBudget()} disabled={mutating}>
              {mutating ? "Creating…" : "Create"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={mutating}
              aria-label="Cancel creating budget"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <SectionCard
          title={usingPersistentWorkspace ? "Workspace budgets" : "Task budgets"}
          description={message}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="pb-3 font-semibold">Scope</th>
                  <th className="pb-3 font-semibold">Used</th>
                  <th className="pb-3 font-semibold">Limit</th>
                  <th className="pb-3 font-semibold">Utilization</th>
                  <th className="pb-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {usingPersistentWorkspace && !persistentLoaded && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      Loading workspace budgets…
                    </td>
                  </tr>
                )}
                {usingPersistentWorkspace && persistentLoaded && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      No budgets are configured for this workspace.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const percent =
                    usdcToNumber(row.limit) > 0
                      ? (usdcToNumber(row.used) / usdcToNumber(row.limit)) * 100
                      : 0;
                  const tone = percent >= 100 ? "red" : percent >= 80 ? "orange" : "blue";
                  return (
                    <tr key={row.id} className="border-b border-line/70 last:border-0">
                      <td className="py-3">
                        <p className="font-semibold">{row.name}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {row.detail}
                          {row.status ? ` · ${row.status}` : ""}
                        </p>
                      </td>
                      <td className="py-3 font-medium">{formatCurrency(row.used)}</td>
                      <td className="py-3">
                        {editing === row.id ? (
                          <input
                            autoFocus
                            className={`${inputClassName} w-32`}
                            inputMode="decimal"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                          />
                        ) : (
                          formatCurrency(row.limit)
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
                        {editing === row.id ? (
                          <Button
                            onClick={() => void saveBudget(row)}
                            disabled={mutating || !canWrite}
                          >
                            <Save className="size-4" /> Save
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            disabled={!canWrite}
                            onClick={() => {
                              setEditing(row.id);
                              setDraft(row.limit);
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

        <SectionCard
          title={usingPersistentWorkspace ? "Budget defaults" : "Payment policy"}
          description={
            usingPersistentWorkspace
              ? "Defaults apply to new budgets created in this session."
              : "Demo controls do not enforce onchain payments."
          }
        >
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
                  value={warningThreshold}
                  onChange={(event) => setWarningThreshold(Number(event.target.value))}
                  className="w-full accent-blue"
                />
                <span className="text-sm font-semibold">{warningThreshold}%</span>
              </div>
            </label>
            {!usingPersistentWorkspace && (
              <Button onClick={() => setMessage("Demo monitoring policy saved locally.")}>
                Save demo policy
              </Button>
            )}
          </div>
        </SectionCard>
      </div>
    </AppShell>
  );
}
