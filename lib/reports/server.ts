import "server-only";

import { getAiCredentialService } from "@/lib/ai/server";
import { getWorkspaceApplicationService } from "@/lib/application/server";
import { getDatabase } from "@/lib/db/client";
import { ReportService } from "@/lib/reports/service";

let reportService: ReportService | undefined;

export function getReportService() {
  reportService ??= new ReportService(
    getDatabase(),
    getWorkspaceApplicationService(),
    getAiCredentialService(),
  );
  return reportService;
}
