"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CircleDollarSign,
  Gauge,
  History,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";

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
  remaining?: UsdcAmount;
  projectedSpend?: UsdcAmount;
  forecastStatus?: "inactive" | "over_limit" | "at_risk" | "warning" | "on_track";
};

type PersistentBudgetMetric = {
  id: string;
  spent: UsdcAmount;
  limit: UsdcAmount;
  paymentCount: number;
  used: number;
  remaining: UsdcAmount;
  projectedSpend: UsdcAmount;
  projectedUsed: number;
  warningThreshold: number;
  forecastStatus: "inactive" | "over_limit" | "at_risk" | "warning" | "on_track";
};

type ScopeOption = { id: string; label: string };
type BudgetRevision = {
  id: string;
  version: number;
  action: string;
  source: string;
  createdAt: string;
  snapshot: { amount: string; status: string; warningThreshold: string };
};

type PersistentBudgetSummary = {
  metrics: { totalSpend: UsdcAmount; assignedBudget: UsdcAmount; budgetUsed: number };
  budgets: PersistentBudgetMetric[];
  providers: Array<{ id: string; name: string }>;
};

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowInput() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function persistentBudgetRow(budget: PersistentBudget, metric?: PersistentBudgetMetric): BudgetRow {
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
    used: metric?.spent ?? "0",
    limit: budget.amount,
    version: budget.version,
    status: budget.status,
    remaining: metric?.remaining,
    projectedSpend: metric?.projectedSpend,
    forecastStatus: metric?.forecastStatus,
  };
}

export function BudgetsPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, signIn, apiFetch } = useWorkspaceSession();
  const [demoBudgets, setDemoBudgets] = useState(() =>
    Object.fromEntries(summary.tasks.map((task) => [task.id, task.budget])),
  );
  const [persistentBudgets, setPersistentBudgets] = useState<PersistentBudget[]>([]);
  const [persistentSummary, setPersistentSummary] = useState<PersistentBudgetSummary | null>(null);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [periodType, setPeriodType] = useState<PersistentBudget["periodType"]>("daily");
  const [periodStart, setPeriodStart] = useState(todayInput);
  const [periodEnd, setPeriodEnd] = useState(tomorrowInput);
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [scopeType, setScopeType] = useState<"workspace" | "wallet" | "task" | "provider">(
    "workspace",
  );
  const [scopeId, setScopeId] = useState("");
  const [scopeOptions, setScopeOptions] = useState<Record<string, ScopeOption[]>>({
    wallet: [],
    task: [],
    provider: [],
  });
  const [history, setHistory] = useState<{ budgetId: string; revisions: BudgetRevision[] } | null>(
    null,
  );
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
          ? persistentBudgets.map((budget) =>
              persistentBudgetRow(
                budget,
                persistentSummary?.budgets.find((metric) => metric.id === budget.id),
              ),
            )
          : []
        : summary.tasks.map((task) => ({
            id: task.id,
            name: task.name,
            detail: task.id.replace("_", "-"),
            used: task.amount,
            limit: demoBudgets[task.id] ?? task.budget,
          })),
    [
      demoBudgets,
      persistentBudgets,
      persistentLoaded,
      persistentSummary,
      summary.tasks,
      usingPersistentWorkspace,
    ],
  );

  const totalBudget = useMemo(
    () =>
      usingPersistentWorkspace && persistentSummary
        ? usdcToNumber(persistentSummary.metrics.assignedBudget)
        : rows.reduce((total, row) => total + usdcToNumber(row.limit), 0),
    [persistentSummary, rows, usingPersistentWorkspace],
  );
  const totalSpend = useMemo(
    () =>
      usingPersistentWorkspace && persistentSummary
        ? usdcToNumber(persistentSummary.metrics.totalSpend)
        : rows.reduce((total, row) => total + usdcToNumber(row.used), 0),
    [persistentSummary, rows, usingPersistentWorkspace],
  );
  const used =
    usingPersistentWorkspace && persistentSummary
      ? persistentSummary.metrics.budgetUsed
      : totalBudget > 0
        ? (totalSpend / totalBudget) * 100
        : 0;

  const loadPersistentBudgets = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const [budgetsResponse, summaryResponse, walletsResponse, tasksResponse, providersResponse] =
        await Promise.all([
          apiFetch("/api/budgets", { signal }),
          apiFetch("/api/analytics/summary", { signal }),
          apiFetch("/api/wallets", { signal }),
          apiFetch("/api/tasks", { signal }),
          apiFetch("/api/providers", { signal }),
        ]);
      for (const response of [
        budgetsResponse,
        summaryResponse,
        walletsResponse,
        tasksResponse,
        providersResponse,
      ]) {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Unable to load workspace budgets"));
        }
      }
      const payload = (await budgetsResponse.json()) as { budgets: PersistentBudget[] };
      const summaryPayload = (await summaryResponse.json()) as PersistentBudgetSummary;
      const walletsPayload = (await walletsResponse.json()) as {
        wallets: Array<{ id: string; label: string }>;
      };
      const tasksPayload = (await tasksResponse.json()) as {
        tasks: Array<{ id: string; name: string }>;
      };
      const providersPayload = (await providersResponse.json()) as {
        policies: Array<{ providerKey: string; displayName: string }>;
      };
      signal?.throwIfAborted();
      setPersistentBudgets(payload.budgets);
      setPersistentSummary(summaryPayload);
      setScopeOptions({
        wallet: walletsPayload.wallets.map((wallet) => ({ id: wallet.id, label: wallet.label })),
        task: tasksPayload.tasks.map((task) => ({ id: task.id, label: task.name })),
        provider: Array.from(
          new Map([
            ...providersPayload.policies.map(
              (provider) =>
                [
                  provider.providerKey,
                  { id: provider.providerKey, label: provider.displayName },
                ] as const,
            ),
            ...summaryPayload.providers.map(
              (provider) => [provider.id, { id: provider.id, label: provider.name }] as const,
            ),
          ]).values(),
        ),
      });
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
        setPersistentSummary(null);
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
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
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

  async function updateBudgetStatus(row: BudgetRow, status: PersistentBudget["status"]) {
    if (!session || !row.version || !canWrite) return;
    setMutating(true);
    try {
      const response = await apiFetch(`/api/budgets/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ expectedVersion: row.version, status }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to change budget status"));
        return;
      }
      await loadPersistentBudgets(session.workspaceId);
      setMessage(`Budget ${status === "active" ? "resumed" : status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to change budget status");
    } finally {
      setMutating(false);
    }
  }

  async function loadHistory(budgetId: string) {
    const response = await apiFetch(`/api/budgets/${encodeURIComponent(budgetId)}`);
    if (!response.ok) {
      setMessage(await getApiErrorMessage(response, "Unable to load budget history"));
      return;
    }
    const payload = (await response.json()) as { revisions: BudgetRevision[] };
    setHistory({ budgetId, revisions: payload.revisions });
  }

  async function createBudget() {
    if (!session || !canWrite) return;
    if (scopeType !== "workspace" && !scopeId) {
      setMessage(`Choose a ${scopeType} before creating the budget.`);
      return;
    }
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
          ...(scopeType === "wallet" ? { walletId: scopeId } : {}),
          ...(scopeType === "task" ? { taskId: scopeId } : {}),
          ...(scopeType === "provider" ? { providerId: scopeId } : {}),
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
      setMessage(`${scopeType[0]?.toUpperCase()}${scopeType.slice(1)} budget created and audited.`);
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
          value={usingPersistentWorkspace ? "Active" : monitoringEnabled ? "Enabled" : "Disabled"}
          detail="Warns only; does not block onchain payments"
          icon={ShieldCheck}
          tone={usingPersistentWorkspace || monitoringEnabled ? "green" : "orange"}
        />
      </div>

      {showForm && usingPersistentWorkspace && (
        <SectionCard
          title="Create a monitoring budget"
          description="Dates use UTC boundaries; enforcement remains observational until a managed wallet policy is connected."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              className={inputClassName}
              value={scopeType}
              onChange={(event) => {
                setScopeType(event.target.value as typeof scopeType);
                setScopeId("");
              }}
              aria-label="Budget scope level"
            >
              <option value="workspace">Workspace</option>
              <option value="wallet">Wallet</option>
              <option value="task">Task</option>
              <option value="provider">Provider</option>
            </select>
            {scopeType === "workspace" ? (
              <div className="flex items-center rounded-md border border-line bg-surface px-3 text-sm text-muted">
                Entire workspace
              </div>
            ) : (
              <select
                className={inputClassName}
                value={scopeId}
                onChange={(event) => setScopeId(event.target.value)}
                aria-label={`Budget ${scopeType}`}
              >
                <option value="">Choose {scopeType}</option>
                {scopeOptions[scopeType]?.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <select
              className={inputClassName}
              value={periodType}
              onChange={(event) => setPeriodType(event.target.value as typeof periodType)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom</option>
              {scopeType === "task" && <option value="task">Task lifetime</option>}
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
            <div className="flex gap-2">
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
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <SectionCard
          title={usingPersistentWorkspace ? "Workspace budgets" : "Task budgets"}
          description={message}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="pb-3 font-semibold">Scope</th>
                  <th className="pb-3 font-semibold">Used</th>
                  <th className="pb-3 font-semibold">Limit</th>
                  <th className="pb-3 font-semibold">Remaining</th>
                  <th className="pb-3 font-semibold">Forecast</th>
                  <th className="pb-3 font-semibold">Utilization</th>
                  <th className="pb-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {usingPersistentWorkspace && !persistentLoaded && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted">
                      Loading workspace budgets…
                    </td>
                  </tr>
                )}
                {usingPersistentWorkspace && persistentLoaded && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted">
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
                      <td className="py-3 font-medium">
                        {row.remaining ? formatCurrency(row.remaining) : "—"}
                      </td>
                      <td className="py-3">
                        <p className="font-medium">
                          {row.projectedSpend ? formatCurrency(row.projectedSpend) : "—"}
                        </p>
                        <p className="mt-0.5 text-xs capitalize text-muted">
                          {row.forecastStatus?.replace("_", " ") ?? "—"}
                        </p>
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
                          <div className="flex justify-end gap-1">
                            {usingPersistentWorkspace && (
                              <Button
                                variant="ghost"
                                onClick={() => void loadHistory(row.id)}
                                aria-label="View budget history"
                                title="History"
                              >
                                <History className="size-4" />
                              </Button>
                            )}
                            {row.status !== "archived" && (
                              <Button
                                variant="ghost"
                                disabled={!canWrite || mutating}
                                onClick={() => {
                                  setEditing(row.id);
                                  setDraft(row.limit);
                                }}
                                aria-label="Edit budget"
                                title="Edit"
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {row.status === "active" && (
                              <Button
                                variant="ghost"
                                disabled={!canWrite || mutating}
                                onClick={() => void updateBudgetStatus(row, "paused")}
                                aria-label="Pause budget"
                                title="Pause"
                              >
                                <Pause className="size-4" />
                              </Button>
                            )}
                            {row.status === "paused" && (
                              <Button
                                variant="ghost"
                                disabled={!canWrite || mutating}
                                onClick={() => void updateBudgetStatus(row, "active")}
                                aria-label="Resume budget"
                                title="Resume"
                              >
                                <Play className="size-4" />
                              </Button>
                            )}
                            {row.status && row.status !== "archived" && (
                              <Button
                                variant="ghost"
                                disabled={!canWrite || mutating}
                                onClick={() => void updateBudgetStatus(row, "archived")}
                                aria-label="Archive budget"
                                title="Archive"
                              >
                                <Archive className="size-4" />
                              </Button>
                            )}
                          </div>
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
              {usingPersistentWorkspace ? (
                <ShieldCheck className="size-5 text-emerald-600" aria-label="Monitoring active" />
              ) : (
                <input
                  type="checkbox"
                  checked={monitoringEnabled}
                  onChange={(event) => setMonitoringEnabled(event.target.checked)}
                  className="size-5 accent-blue"
                />
              )}
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

      {history && (
        <SectionCard
          title="Budget history"
          description="Immutable snapshots for every audited version."
        >
          <div className="mb-3 flex justify-end">
            <Button variant="ghost" onClick={() => setHistory(null)}>
              <X className="size-4" /> Close
            </Button>
          </div>
          <div className="grid gap-2">
            {history.revisions.map((revision) => (
              <div
                key={revision.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white p-3 text-sm"
              >
                <span className="font-semibold">
                  v{revision.version} · {revision.action.replace("_", " ")}
                </span>
                <span>
                  {formatCurrency(revision.snapshot.amount)} · {revision.snapshot.warningThreshold}%
                  · {revision.snapshot.status}
                </span>
                <span className="text-xs text-muted">
                  {revision.source} · {new Date(revision.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </AppShell>
  );
}
