import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { aiReportContentSchema, type AiReportContent } from "@/lib/ai/report-generator";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const colors = {
  ink: rgb(0.08, 0.12, 0.2),
  muted: rgb(0.38, 0.44, 0.54),
  blue: rgb(0.2, 0.4, 1),
  line: rgb(0.87, 0.89, 0.93),
};

class FontResolver {
  private readonly latin: PDFFont;
  private cjk: PDFFont | undefined;

  constructor(private readonly document: PDFDocument) {
    this.latin = document.embedStandardFont(StandardFonts.Helvetica);
  }

  async preload() {
    if (this.cjk) return;
    const fontPath = path.join(
      process.cwd(),
      "node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf",
    );
    this.cjk = await this.document.embedFont(await readFile(fontPath), { subset: false });
  }

  get(character: string) {
    if ((character.codePointAt(0) ?? 0) <= 0x7f) return { key: "latin", font: this.latin };
    if (!this.cjk) throw new Error("PDF CJK font was not preloaded");
    return { key: "noto-sans-sc", font: this.cjk };
  }
}

function textWidth(text: string, size: number, fonts: FontResolver) {
  return Array.from(text).reduce((width, character) => {
    return width + fonts.get(character).font.widthOfTextAtSize(character, size);
  }, 0);
}

function breakToken(token: string, size: number, width: number, fonts: FontResolver) {
  const lines: string[] = [];
  let current = "";
  for (const character of Array.from(token)) {
    if (current && textWidth(current + character, size, fonts) > width) {
      lines.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string, size: number, width: number, fonts: FontResolver) {
  const lines: string[] = [];
  let current = "";
  for (const token of text.split(/(\s+)/).filter(Boolean)) {
    const candidate = current + token;
    if (!current || textWidth(candidate, size, fonts) <= width) {
      current = candidate;
      continue;
    }
    lines.push(current.trimEnd());
    if (textWidth(token.trim(), size, fonts) <= width) {
      current = token.trimStart();
    } else {
      const pieces = breakToken(token.trim(), size, width, fonts);
      lines.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? "";
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function drawMixedText(
  page: PDFPage,
  text: string,
  options: { x: number; y: number; size: number; color: ReturnType<typeof rgb> },
  fonts: FontResolver,
) {
  let x = options.x;
  let run = "";
  let runKey = "";
  const flush = () => {
    if (!run) return;
    const font = fonts.get(run[0]).font;
    page.drawText(run, { x, y: options.y, size: options.size, font, color: options.color });
    x += font.widthOfTextAtSize(run, options.size);
    run = "";
  };
  for (const character of Array.from(text)) {
    const key = fonts.get(character).key;
    if (run && key !== runKey) flush();
    runKey = key;
    run += character;
  }
  flush();
}

type PdfReport = {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  generatedAt: Date | null;
  content: Record<string, unknown> | null;
};

export async function renderReportPdf(report: PdfReport) {
  const content: AiReportContent = aiReportContentSchema.parse(report.content);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle(report.title);
  document.setSubject("Agent CFO workspace report");
  document.setCreator("Agent CFO for Arc");
  const fonts = new FontResolver(document);
  await fonts.preload();

  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const ensureSpace = (height: number) => {
    if (y - height >= MARGIN + 24) return;
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const paragraph = (
    text: string,
    options: { size?: number; color?: ReturnType<typeof rgb>; gap?: number; width?: number } = {},
  ) => {
    const size = options.size ?? 10;
    const lineHeight = size * 1.55;
    const lines = wrapText(text, size, options.width ?? CONTENT_WIDTH, fonts);
    for (const line of lines) {
      ensureSpace(lineHeight);
      drawMixedText(page, line, { x: MARGIN, y, size, color: options.color ?? colors.ink }, fonts);
      y -= lineHeight;
    }
    y -= options.gap ?? 6;
  };
  const sectionTitle = (text: string) => {
    ensureSpace(36);
    y -= 7;
    paragraph(text, { size: 12, color: colors.blue, gap: 8 });
  };

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 10,
    width: PAGE_WIDTH,
    height: 10,
    color: colors.blue,
  });
  paragraph("AGENT CFO FOR ARC", { size: 8, color: colors.blue, gap: 12 });
  paragraph(content.headline, { size: 22, gap: 10 });
  paragraph(content.executiveSummary, { size: 11, color: colors.muted, gap: 16 });
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: colors.line,
  });
  y -= 18;
  paragraph(`Provider: ${report.provider ?? "local"}  |  Model: ${report.model ?? "unknown"}`, {
    size: 8,
    color: colors.muted,
    gap: 2,
  });
  paragraph(
    `Generated: ${report.generatedAt?.toISOString() ?? "not recorded"}  |  Report ID: ${report.id}`,
    { size: 8, color: colors.muted, gap: 14 },
  );

  if (content.findings.length) {
    sectionTitle("Findings");
    content.findings.forEach((finding, index) => {
      ensureSpace(78);
      paragraph(`${index + 1}. ${finding.title}`, { size: 11, gap: 3 });
      paragraph(finding.evidence, { color: colors.muted, gap: 3 });
      paragraph(finding.impact, { gap: 10 });
    });
  }
  if (content.recommendations.length) {
    sectionTitle("Recommended actions");
    content.recommendations.forEach((recommendation, index) => {
      ensureSpace(62);
      paragraph(
        `${index + 1}. [${recommendation.priority.toUpperCase()}] ${recommendation.action}`,
        { size: 11, gap: 3 },
      );
      paragraph(recommendation.rationale, { color: colors.muted, gap: 10 });
    });
  }
  if (content.caveats.length) {
    sectionTitle("Scope and caveats");
    content.caveats.forEach((caveat) => paragraph(`- ${caveat}`, { color: colors.muted, gap: 4 }));
  }

  const pages = document.getPages();
  pages.forEach((current, index) => {
    current.drawLine({
      start: { x: MARGIN, y: 38 },
      end: { x: PAGE_WIDTH - MARGIN, y: 38 },
      thickness: 1,
      color: colors.line,
    });
    drawMixedText(
      current,
      "Agent CFO for Arc",
      { x: MARGIN, y: 22, size: 7, color: colors.muted },
      fonts,
    );
    const pageLabel = `${index + 1} / ${pages.length}`;
    const labelWidth = textWidth(pageLabel, 7, fonts);
    drawMixedText(
      current,
      pageLabel,
      { x: PAGE_WIDTH - MARGIN - labelWidth, y: 22, size: 7, color: colors.muted },
      fonts,
    );
  });
  return document.save();
}
