import { Bot, Boxes, Brain, Cloud, Database, Hexagon, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const providerIcons: Record<string, { icon: LucideIcon; tone: string }> = {
  OpenAI: { icon: Bot, tone: "bg-zinc-950 text-white" },
  Pinecone: { icon: Boxes, tone: "bg-zinc-100 text-zinc-950" },
  Anthropic: { icon: Brain, tone: "bg-amber-100 text-amber-900" },
  Snowflake: { icon: Hexagon, tone: "bg-sky-100 text-sky-600" },
  Cloudflare: { icon: Cloud, tone: "bg-orange-100 text-orange-600" },
  "DeepInfra Labs": { icon: Database, tone: "bg-blue-soft text-blue" },
};

export function ProviderMark({ provider, className }: { provider: string; className?: string }) {
  const config = providerIcons[provider] ?? providerIcons.OpenAI;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
        config.tone,
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  );
}
