import "server-only";

import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getDatabase } from "@/lib/db/client";
import { PublicCircleEvidenceSyncAdapter } from "@/lib/sync/circle-public-adapter";
import { WorkspaceSyncService } from "@/lib/sync/service";

let syncService: WorkspaceSyncService | undefined;

export function getWorkspaceSyncService() {
  syncService ??= new WorkspaceSyncService(getDatabase(), getWorkspaceApplicationService(), [
    new PublicCircleEvidenceSyncAdapter(),
  ]);
  return syncService;
}
