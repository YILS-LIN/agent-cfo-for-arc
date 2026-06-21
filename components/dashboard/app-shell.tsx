"use client";

import type { ReactNode } from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { AuthAccountControl } from "@/components/auth/auth-account-control";

type AppShellProps = {
  title: string;
  description: string;
  owner: string;
  children: ReactNode;
  actions?: ReactNode;
};

function HeaderControls({ owner }: { owner: string }) {
  return <AuthAccountControl fallbackOwner={owner} />;
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
