import { apiErrorResponse } from "@/lib/application/api-errors";
import { getAuthService } from "@/lib/auth/server";
import { renderReportPdf } from "@/lib/reports/pdf";
import { getReportService } from "@/lib/reports/server";
import { ReportNotReadyError } from "@/lib/reports/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(title: string) {
  const normalized = title
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${normalized || "agent-cfo-report"}.pdf`;
}

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    const { reportId } = await params;
    const report = await getReportService().get(context, reportId);
    if (report.status !== "completed" || !report.content) {
      throw new ReportNotReadyError("Only completed reports can be exported");
    }
    const bytes = await renderReportPdf(report);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeFilename(report.title)}"`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
