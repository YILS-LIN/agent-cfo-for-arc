import { TasksPage } from "@/components/workspace/tasks-page";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

export default function Page() {
  return <TasksPage summary={buildAgentSpendSummary()} />;
}
