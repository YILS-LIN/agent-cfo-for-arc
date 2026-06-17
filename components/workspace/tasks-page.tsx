"use client";

import { useMemo, useState } from "react";
import { Briefcase, CircleDollarSign, Pause, Play, RotateCcw, Search } from "lucide-react";

import { AppShell } from "@/components/dashboard/app-shell";
import {
  ProgressBar,
  SectionCard,
  SummaryStat,
  inputClassName,
} from "@/components/dashboard/page-ui";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AgentSpendSummary, TaskSummary } from "@/types/agent";

type RunState = "Running" | "Paused" | "Completed";

export function TasksPage({ summary }: { summary: AgentSpendSummary }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | RunState>("All");
  const [states, setStates] = useState<Record<string, RunState>>(() =>
    Object.fromEntries(
      summary.tasks.map((task, index) => [
        task.id,
        index < 2 ? "Running" : index < 5 ? "Completed" : "Paused",
      ]),
    ),
  );
  const [selected, setSelected] = useState<TaskSummary | null>(summary.tasks[0] ?? null);
  const tasks = useMemo(
    () =>
      summary.tasks.filter(
        (task) =>
          (filter === "All" || states[task.id] === filter) &&
          task.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [filter, query, states, summary.tasks],
  );
  const running = Object.values(states).filter((state) => state === "Running").length;

  function cycleTask(id: string) {
    setStates((current) => ({
      ...current,
      [id]: current[id] === "Running" ? "Paused" : "Running",
    }));
  }

  return (
    <AppShell
      title="Agent Tasks"
      description="Track task-level spend, budgets, and execution state"
      owner={summary.profile.owner}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryStat
          label="Tracked tasks"
          value={summary.tasks.length.toString()}
          detail="All with x402 activity"
          icon={Briefcase}
        />
        <SummaryStat
          label="Running now"
          value={running.toString()}
          detail="Payments permitted by policy"
          icon={Play}
          tone="green"
        />
        <SummaryStat
          label="Task spend"
          value={formatCurrency(summary.metrics.totalSpend)}
          detail="Current reporting window"
          icon={CircleDollarSign}
          tone="orange"
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="Task registry"
          description="Pause a task to block new paid resource requests."
        >
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
              <option>All</option>
              <option>Running</option>
              <option>Paused</option>
              <option>Completed</option>
            </select>
          </div>
          <div className="grid gap-2">
            {tasks.map((task) => {
              const state = states[task.id];
              const used = (task.amount / task.budget) * 100;
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
                        onClick={() => setSelected(task)}
                      >
                        {task.name}
                      </button>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${state === "Running" ? "bg-green/10 text-green" : state === "Paused" ? "bg-orange/10 text-orange" : "bg-slate-100 text-muted"}`}
                      >
                        {state}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {task.id.replace("_", "-")} · {task.paymentCount} payments
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
                      onClick={(event) => {
                        event.stopPropagation();
                        cycleTask(task.id);
                      }}
                    >
                      {state === "Running" ? (
                        <>
                          <Pause className="size-4" /> Pause
                        </>
                      ) : (
                        <>
                          <Play className="size-4" /> Run
                        </>
                      )}
                    </Button>
                  </span>
                </article>
              );
            })}
          </div>
        </SectionCard>
        <SectionCard
          title="Task details"
          description={selected ? selected.id.replace("_", "-") : "Select a task"}
        >
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
                  <p className="text-xs text-muted">Budget state</p>
                  <p className="mt-1 text-sm font-semibold">{selected.status}</p>
                </div>
              </div>
              <div className="mt-5 rounded-lg border border-line p-3">
                <p className="text-xs font-semibold text-muted">Latest CFO note</p>
                <p className="mt-2 text-sm leading-6">
                  This task contributes {formatPercent(selected.share)} of total agent spend. Review
                  repeated paid resources before the next run.
                </p>
              </div>
              <Button
                className="mt-4 w-full"
                variant="soft"
                onClick={() => setStates((current) => ({ ...current, [selected.id]: "Running" }))}
              >
                <RotateCcw className="size-4" /> Restart task
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
