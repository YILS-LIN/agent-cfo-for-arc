import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { renderReportPdf } from "@/lib/reports/pdf";

describe("renderReportPdf", () => {
  it("renders a paginated PDF with mixed English and Chinese content", async () => {
    const bytes = await renderReportPdf({
      id: "report-test",
      title: "CFO report 财务报告",
      provider: "local",
      model: "deterministic-v1",
      generatedAt: new Date("2026-06-20T12:00:00.000Z"),
      content: {
        headline: "Spend remained controlled 支出保持可控",
        executiveSummary: "The workspace remained within budget. 工作区支出未超出预算。",
        findings: Array.from({ length: 8 }, (_, index) => ({
          title: `Finding ${index + 1} · 观察`,
          evidence:
            "Persisted payment evidence supports this finding across the selected reporting window. 已持久化付款记录支持该结论。",
          impact:
            "Continue monitoring provider concentration, budget utilization, and payment volume before changing workspace policy.",
        })),
        recommendations: [
          {
            action: "Review the top provider 审查主要供应商",
            rationale: "Concentration should be reviewed before changing policy.",
            priority: "medium",
          },
        ],
        caveats: ["This report does not authorize onchain payments. 本报告不授权链上付款。"],
      },
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getTitle()).toBe("CFO report 财务报告");
  });
});
