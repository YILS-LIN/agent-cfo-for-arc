"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, CircleDollarSign, Pause, Play, Plus, RotateCcw, Search, X } from "lucide-react";

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
import { sumUsdc, usdcToNumber, type UsdcAmount } from "@/lib/domain/usdc";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary } from "@/types/agent";

type TaskStatus = "pending" | "running" | "paused" | "completed" | "failed";

type PersistentTask = {
  id: string;
  walletId?: string | null;
  externalKey?: string | null;
  name: string;
  status: TaskStatus;
  version: number;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

type TaskView = {
  id: string;
  name: string;
  status: TaskStatus;
  amount: UsdcAmount;
  budget: UsdcAmount;
  paymentCount: number;
  share: number;
  version?: number;
  detail: string;
};

type PersistentTaskMetric = {
  id: string;
  spent: UsdcAmount;
  assignedBudget: UsdcAmount;
  paymentCount: number;
  share: number;
  budgetUsed: number;
};

function statusLabel(status: TaskStatus) {
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

export function TasksPage({ summary }: { summary: AgentSpendSummary }) {
  const { mode, authenticated, session, signIn, apiFetch } = useWorkspaceSession();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [demoStates, setDemoStates] = useState<Record<string, TaskStatus>>(() =>
    Object.fromEntries(
      summary.tasks.map((task, index) => [
        task.id,
        index < 2 ? "running" : index < 5 ? "completed" : "paused",
      ]),
    ),
  );
  const [persistentTasks, setPersistentTasks] = useState<PersistentTask[]>([]);
  const [persistentMetrics, setPersistentMetrics] = useState<PersistentTaskMetric[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(summary.tasks[0]?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [externalKey, setExternalKey] = useState("");
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState(
    "Demo lifecycle controls are local and do not control an external agent.",
  );

  const usingPersistentWorkspace = mode === "persistent" && authenticated;
  const persistentLoaded = Boolean(session && loadedWorkspaceId === session.workspaceId);
  const canWrite = !usingPersistentWorkspace || (session !== null && session.role !== "viewer");
  const allTasks = useMemo<TaskView[]>(
    () =>
      usingPersistentWorkspace
        ? persistentLoaded
          ? persistentTasks.map((task) => {
              const metric = persistentMetrics.find((item) => item.id === task.id);
              return {
                id: task.id,
                name: task.name,
                status: task.status,
                amount: metric?.spent ?? "0",
                budget: metric?.assignedBudget ?? "0",
                paymentCount: metric?.paymentCount ?? 0,
                share: metric?.share ?? 0,
                version: task.version,
                detail:
                  task.externalKey ?? `Updated ${new Date(task.updatedAt).toLocaleDateString()}`,
              };
            })
          : []
        : summary.tasks.map((task) => ({
            ...task,
            status: demoStates[task.id] ?? "pending",
            detail: task.id.replace("_", "-"),
          })),
    [
      demoStates,
      persistentLoaded,
      persistentMetrics,
      persistentTasks,
      summary.tasks,
      usingPersistentWorkspace,
    ],
  );
  const tasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allTasks.filter(
      (task) =>
        (filter === "all" || task.status === filter) &&
        (!needle ||
          task.name.toLowerCase().includes(needle) ||
          task.detail.toLowerCase().includes(needle)),
    );
  }, [allTasks, filter, query]);
  const selected = allTasks.find((task) => task.id === selectedId) ?? allTasks[0] ?? null;
  const running = allTasks.filter((task) => task.status === "running").length;
  const taskSpend = sumUsdc(allTasks.map((task) => task.amount));

  const loadPersistentTasks = useCallback(
    async (workspaceId: string, signal?: AbortSignal) => {
      const [tasksResponse, summaryResponse] = await Promise.all([
        apiFetch("/api/tasks", { signal }),
        apiFetch("/api/analytics/summary", { signal }),
      ]);
      for (const response of [tasksResponse, summaryResponse]) {
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Unable to load workspace tasks"));
        }
      }
      const payload = (await tasksResponse.json()) as { tasks: PersistentTask[] };
      const summaryPayload = (await summaryResponse.json()) as { tasks: PersistentTaskMetric[] };
      signal?.throwIfAborted();
      setPersistentTasks(payload.tasks);
      setPersistentMetrics(summaryPayload.tasks);
      setLoadedWorkspaceId(workspaceId);
      setMessage(
        payload.tasks.length
          ? "Lifecycle states are persisted with audited, versioned updates."
          : "No persistent tasks yet. Register the first observed agent task.",
      );
    },
    [apiFetch],
  );

  useEffect(() => {
    if (!usingPersistentWorkspace || !session) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => loadPersistentTasks(session.workspaceId, controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setPersistentTasks([]);
        setPersistentMetrics([]);
        setLoadedWorkspaceId(session.workspaceId);
        setMessage(error instanceof Error ? error.message : "Unable to load workspace tasks");
      });
    return () => controller.abort();
  }, [loadPersistentTasks, session, usingPersistentWorkspace]);

  async function createTask() {
    if (!session || !canWrite || !name.trim()) {
      setMessage("Enter a task name before creating it.");
      return;
    }
    setMutating(true);
    try {
      const response = await apiFetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: name.trim(),
          externalKey: externalKey.trim() || undefined,
          status: "pending",
          metadata: {},
        }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to create task"));
        return;
      }
      const payload = (await response.json()) as { task: PersistentTask };
      await loadPersistentTasks(session.workspaceId);
      setSelectedId(payload.task.id);
      setName("");
      setExternalKey("");
      setShowForm(false);
      setMessage("Task registered in the persistent workspace.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create task");
    } finally {
      setMutating(false);
    }
  }

  async function updateStatus(task: TaskView, status: TaskStatus) {
    if (!usingPersistentWorkspace) {
      setDemoStates((current) => ({ ...current, [task.id]: status }));
      return;
    }
    if (!session || !task.version || !canWrite) return;
    setMutating(true);
    try {
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, expectedVersion: task.version }),
      });
      if (!response.ok) {
        setMessage(await getApiErrorMessage(response, "Unable to update task status"));
        await loadPersistentTasks(session.workspaceId);
        return;
      }
      await loadPersistentTasks(session.workspaceId);
      setMessage(`Task marked ${status}; this does not issue a command to the external agent.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update task status");
    } finally {
      setMutating(false);
    }
  }

  return (
    <AppShell
      title="Agent Tasks"
      description={
        usingPersistentWorkspace
          ? "Track audited lifecycle state for workspace agent tasks"
          : "Explore demo task spend, budgets, and execution state"
      }
      owner={summary.profile.owner}
      actions={
        mode === "persistent" && !authenticated ? (
          <Button onClick={signIn}>
            <Plus className="size-4" /> Sign in to manage
          </Button>
        ) : usingPersistentWorkspace ? (
          <Button onClick={() => setShowForm(true)} disabled={!canWrite}>
            <Plus className="size-4" /> Add task
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Tracked tasks"
          value={allTasks.length.toString()}
          detail={
            usingPersistentWorkspace ? "Tenant-scoped registry" : "All with demo x402 activity"
          }
          icon={Briefcase}
        />
        <SummaryStat
          label="Running now"
          value={running.toString()}
          detail={
            usingPersistentWorkspace ? "Observed lifecycle state" : "Local demo execution state"
          }
          icon={Play}
          tone="green"
        />
        <SummaryStat
          label="Task spend"
          value={formatCurrency(taskSpend)}
          detail={
            usingPersistentWorkspace
              ? "Linked ledger aggregation follows"
              : "Current reporting window"
          }
          icon={CircleDollarSign}
          tone="orange"
        />
      </div>

      {showForm && usingPersistentWorkspace && (
        <SectionCard
          title="Register an observed task"
          description="This records task identity and lifecycle metadata; it does not start an external agent."
        >
          <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto_auto]">
            <input
              className={inputClassName}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Task name"
              maxLength={200}
            />
            <input
              className={inputClassName}
              value={externalKey}
              onChange={(event) => setExternalKey(event.target.value)}
              placeholder="External task key (optional)"
              maxLength={240}
            />
            <Button onClick={() => void createTask()} disabled={mutating}>
              {mutating ? "Creating…" : "Create"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowForm(false)}
              disabled={mutating}
              aria-label="Cancel creating task"
            >
              <X className="size-4" />
            </Button>
          </div>
        </SectionCard>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard title="Task registry" description={message}>
          <div className="mb-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px]">
            <label className="relative">
              <Search className="absolute left-3 top-3 size-4 text-muted" />
              <input
                className={`${inputClassName} w-full pl-9`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks"
              />
            </label>
            <select
              className={inputClassName}
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div className="grid gap-2">
            {usingPersistentWorkspace && !persistentLoaded && (
              <div className="h-24 animate-pulse rounded-lg border border-line bg-white" />
            )}
            {persistentLoaded && usingPersistentWorkspace && tasks.length === 0 && (
              <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
                No tasks match this view.
              </p>
            )}
            {tasks.map((task) => {
              const used =
                usdcToNumber(task.budget) > 0
                  ? (usdcToNumber(task.amount) / usdcToNumber(task.budget)) * 100
                  : 0;
              return (
                <article
                  key={task.id}
                  className={`grid gap-3 rounded-lg border bg-white p-4 text-left lg:grid-cols-[minmax(240px,1fr)_110px_190px_auto] lg:items-center ${selected?.id === task.id ? "border-blue ring-2 ring-blue/10" : "border-line"}`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-sm font-bold hover:text-blue"
                        onClick={() => setSelectedId(task.id)}
                      >
                        {task.name}
                      </button>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${task.status === "running" ? "bg-green/10 text-green" : task.status === "failed" ? "bg-red/10 text-red" : task.status === "paused" ? "bg-orange/10 text-orange" : "bg-slate-100 text-muted"}`}
                      >
                        {statusLabel(task.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {task.detail} · {task.paymentCount} payments
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Spend</p>
                    <p className="mt-1 font-semibold">{formatCurrency(task.amount)}</p>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{formatPercent(used)}</span>
                      <span className="text-muted">of {formatCurrency(task.budget)}</span>
                    </div>
                    <ProgressBar
                      value={used}
                      tone={used >= 100 ? "red" : used >= 80 ? "orange" : "blue"}
                    />
                  </div>
                  <span className="justify-self-end">
                    <Button
                      variant="ghost"
                      disabled={!canWrite || mutating}
                      onClick={() =>
                        void updateStatus(task, task.status === "running" ? "paused" : "running")
                      }
                    >
                      {task.status === "running" ? (
                        <>
                          <Pause className="size-4" /> Mark paused
                        </>
                      ) : (
                        <>
                          <Play className="size-4" /> Mark running
                        </>
                      )}
                    </Button>
                  </span>
                </article>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Task details" description={selected?.detail ?? "Select a task"}>
          {selected ? (
            <div>
              <h3 className="text-lg font-bold">{selected.name}</h3>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted">Spend</p>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(selected.amount)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted">Share</p>
                  <p className="mt-1 text-lg font-semibold">{formatPercent(selected.share)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted">Payments</p>
                  <p className="mt-1 text-lg font-semibold">{selected.paymentCount}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted">Lifecycle state</p>
                  <p className="mt-1 text-sm font-semibold">{statusLabel(selected.status)}</p>
                </div>
              </div>
              <div className="mt-5 rounded-lg border border-line p-3">
                <p className="text-xs font-semibold text-muted">Latest CFO note</p>
                <p className="mt-2 text-sm leading-6">
                  {usingPersistentWorkspace
                    ? "No persisted payment events are linked yet. Lifecycle changes are observational and fully audited."
                    : `This task contributes ${formatPercent(selected.share)} of total agent spend. Review repeated paid resources before the next run.`}
                </p>
              </div>
              <Button
                className="mt-4 w-full"
                variant="soft"
                disabled={!canWrite || mutating}
                onClick={() => void updateStatus(selected, "running")}
              >
                <RotateCcw className="size-4" /> Mark as restarted
              </Button>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted">Select a task to inspect it.</p>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
