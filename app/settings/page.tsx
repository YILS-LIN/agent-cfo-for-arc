import { SettingsPage } from "@/components/workspace/settings-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <SettingsPage summary={buildAgentSpendSummary()} />;
}
