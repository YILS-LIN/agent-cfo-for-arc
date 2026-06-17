"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Briefcase,
  CircleDollarSign,
  Home,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const navigationItems = [
  { label: "Overview", href: "/", icon: Home },
  { label: "Wallets", href: "/wallets", icon: Wallet },
  { label: "Spend", href: "/spend", icon: CircleDollarSign },
  { label: "Providers", href: "/providers", icon: Users },
  { label: "Budgets", href: "/budgets", icon: ShieldCheck },
  { label: "Risks", href: "/risks", icon: AlertTriangle },
  { label: "Tasks", href: "/tasks", icon: Briefcase },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavigationLinks({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  return navigationItems.map((item) => {
    const Icon = item.icon;
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          mobile
            ? "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
            : "flex w-[86px] flex-col items-center gap-2 rounded-lg py-3 text-[11px] font-semibold",
          active
            ? "border border-blue/10 bg-blue-soft text-blue shadow-sm"
            : "text-muted hover:bg-white hover:text-foreground",
        )}
      >
        <Icon className={mobile ? "size-4" : "size-5"} />
        {item.label}
      </Link>
    );
  });
}

export function Sidebar() {
  return (
    <>
      <aside className="dashboard-card fixed inset-y-0 left-0 z-30 hidden w-[118px] flex-col items-center rounded-r-lg border-l-0 py-7 lg:flex">
        <Link
          href="/"
          className="mb-8 flex size-12 items-center justify-center rounded-lg bg-white"
          aria-label="Agent CFO overview"
        >
          <Target className="size-8 text-blue" strokeWidth={2.4} />
        </Link>
        <nav
          className="flex w-full flex-1 flex-col items-center gap-2"
          aria-label="Primary navigation"
        >
          <NavigationLinks />
        </nav>
      </aside>

      <div className="sticky top-0 z-30 border-b border-line bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Mobile navigation">
          <NavigationLinks mobile />
        </nav>
      </div>
    </>
  );
}
