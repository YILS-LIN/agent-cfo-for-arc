"use client";

import { ChevronDown, LogIn, LogOut } from "lucide-react";
import { useState } from "react";

import { useWorkspaceSession } from "@/components/auth/workspace-session-provider";

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AuthAccountControl({ fallbackOwner }: { fallbackOwner: string }) {
  const {
    mode,
    ready,
    authenticated,
    displayName: authenticatedDisplayName,
    session,
    sessionError,
    signIn,
    signOut,
  } = useWorkspaceSession();
  const [open, setOpen] = useState(false);

  if (mode === "demo") {
    return (
      <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-2.5">
        <span className="flex size-7 items-center justify-center rounded-full bg-blue-soft text-[10px] font-bold text-blue">
          {initials(fallbackOwner)}
        </span>
        <span className="hidden text-left xl:block">
          <span className="block text-xs font-semibold">{fallbackOwner}</span>
          <span className="block text-[10px] text-muted">Public demo</span>
        </span>
      </div>
    );
  }

  if (!ready) {
    return <div className="h-10 w-28 animate-pulse rounded-lg border border-line bg-white" />;
  }
  if (!authenticated) {
    return (
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue px-3 text-sm font-semibold text-white"
        onClick={signIn}
      >
        <LogIn className="size-4" /> Sign in
      </button>
    );
  }

  const displayName = authenticatedDisplayName || fallbackOwner;
  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-2.5"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-blue-soft text-[10px] font-bold text-blue">
          {initials(displayName)}
        </span>
        <span className="hidden text-left xl:block">
          <span className="block max-w-36 truncate text-xs font-semibold">{displayName}</span>
          <span className="block text-[10px] capitalize text-muted">
            {session?.role ?? "Initializing"}
          </span>
        </span>
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-lg border border-line bg-white p-2 text-sm shadow-xl">
          <p className="truncate px-2 py-1 font-semibold">{displayName}</p>
          <p className="px-2 pb-2 text-xs text-muted">
            {sessionError ??
              (session ? `${session.role} workspace access` : "Initializing workspace…")}
          </p>
          <a href="/settings" className="block rounded-md px-2 py-2 hover:bg-blue-soft">
            Workspace settings
          </a>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-blue-soft"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
