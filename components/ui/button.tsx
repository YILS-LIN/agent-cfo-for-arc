import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft";
};

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-blue/30 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-blue text-white shadow-[0_10px_24px_rgba(52,101,255,0.28)] hover:-translate-y-0.5 hover:bg-blue/90",
        variant === "ghost" && "border border-line bg-white/70 text-foreground hover:bg-blue-soft",
        variant === "soft" && "bg-blue-soft text-blue hover:bg-blue-soft/80",
        className,
      )}
      {...props}
    />
  );
}
