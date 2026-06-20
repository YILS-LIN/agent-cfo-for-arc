import "server-only";

import { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import { getDatabase } from "@/lib/db/client";

let workspaceService: WorkspaceApplicationService | undefined;

export function getWorkspaceApplicationService() {
  workspaceService ??= new WorkspaceApplicationService(getDatabase());
  return workspaceService;
}
