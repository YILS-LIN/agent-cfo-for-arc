"use client";

import { Bell, CalendarDays, ChevronDown, Globe2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";

type AppShellProps = {
  title: string;
  description: string;
  owner: string;
  children: ReactNode;
  actions?: ReactNode;
};

function HeaderControls({ owner }: { owner: string }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold">
        <Globe2 className="size-4" />
        <select
          className="bg-transparent outline-none"
          aria-label="Arc network"
          defaultValue="Arc Mainnet"
        >
          <option>Arc Mainnet</option>
          <option>Arc Testnet</option>
        </select>
      </label>
      <label className="hidden h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold sm:inline-flex">
        <CalendarDays className="size-4" />
        <select
          className="bg-transparent outline-none"
          aria-label="Reporting period"
          defaultValue="May 12 - May 19, 2025"
        >
          <option>May 12 - May 19, 2025</option>
          <option>Last 30 days</option>
          <option>Quarter to date</option>
        </select>
      </label>
      <div className="relative">
        <button
          type="button"
          className="relative inline-flex size-10 items-center justify-center rounded-lg border border-line bg-white"
          aria-label="Notifications"
          aria-expanded={notificationsOpen}
          onClick={() => setNotificationsOpen((value) => !value)}
        >
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-blue" />
        </button>
        {notificationsOpen && (
          <div className="absolute right-0 top-12 z-40 w-72 rounded-lg border border-line bg-white p-3 shadow-xl">
            <p className="text-sm font-bold">Notifications</p>
            <p className="mt-2 rounded-lg bg-red/5 p-2 text-xs leading-5 text-muted">
              Repeated dataset purchases need review.
            </p>
            <p className="mt-2 rounded-lg bg-orange/5 p-2 text-xs leading-5 text-muted">
              Report Drafting has exceeded its task budget.
            </p>
          </div>
        )}
      </div>
      <div className="relative">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-2.5"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((value) => !value)}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-blue-soft text-[10px] font-bold text-blue">
            AM
          </span>
          <span className="hidden text-left xl:block">
            <span className="block text-xs font-semibold">{owner}</span>
            <span className="block text-[10px] text-muted">Admin</span>
          </span>
          <ChevronDown className="size-3.5 text-muted" />
        </button>
        {accountOpen && (
          <div className="absolute right-0 top-12 z-40 w-48 rounded-lg border border-line bg-white p-2 text-sm shadow-xl">
            <p className="px-2 py-1 font-semibold">{owner}</p>
            <p className="px-2 pb-2 text-xs text-muted">Workspace administrator</p>
            <a href="/settings" className="block rounded-md px-2 py-2 hover:bg-blue-soft">
              Workspace settings
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({ title, description, owner, children, actions }: AppShellProps) {
  return (
    <div className="min-h-screen lg:pl-[118px]">
      <Sidebar />
      <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-muted">{description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <HeaderControls owner={owner} />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
