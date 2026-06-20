import type { AuthContext } from "@/lib/auth/types";
import type { AiCredentialService } from "@/lib/ai/credential-service";
import {
  AiProviderResponseError,
  OpenAiReportGenerator,
  aiReportContentSchema,
  type AiReportContent,
} from "@/lib/ai/report-generator";
import type { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import {
  ApplicationPermissionError,
  IdempotencyKeyRequiredError,
  IdempotencyRequestUnresolvedError,
} from "@/lib/application/workspace-service";
import type { AppDatabase } from "@/lib/db/database";
import {
  AuditRepository,
  IdempotencyRepository,
  ReportRepository,
  RepositoryNotFoundError,
} from "@/lib/db/repositories";
import { buildLocalReport } from "@/lib/reports/local-report";
import type { AgentSpendSummary } from "@/types/agent";

const PROMPT_VERSION = "cfo-report-v1";

type ReportProvider = "local" | "openai";
type GeneratedReport = {
  content: AiReportContent;
  responseId?: string;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};
type Generator = { generate(summary: AgentSpendSummary): Promise<GeneratedReport> };

export class ReportContentError extends Error {}
export class ReportNotReadyError extends Error {}

function requireWriteRole(context: AuthContext) {
  if (context.role === "viewer") {
    throw new ApplicationPermissionError("Viewer role cannot generate reports");
  }
}

function normalizeKey(value: string) {
  const key = value.trim();
  if (!key || key.length > 255) {
    throw new IdempotencyKeyRequiredError("A valid Idempotency-Key is required");
  }
  return key;
}

export class ReportService {
  private readonly reports: ReportRepository;
  private readonly idempotency: IdempotencyRepository;

  constructor(
    private readonly database: AppDatabase,
    private readonly workspaceService: WorkspaceApplicationService,
    private readonly credentials: AiCredentialService,
    private readonly openAiFactory: (apiKey: string, model: string) => Generator = (
      apiKey,
      model,
    ) => new OpenAiReportGenerator(apiKey, model),
  ) {
    this.reports = new ReportRepository(database);
    this.idempotency = new IdempotencyRepository(database);
  }

  list(context: AuthContext) {
    return this.reports.list(context);
  }

  async get(context: AuthContext, reportId: string) {
    const report = await this.reports.getById(context, reportId);
    if (!report) throw new RepositoryNotFoundError("Report not found");
    if (report.status === "completed" && report.content) {
      const parsed = aiReportContentSchema.safeParse(report.content);
      if (!parsed.success) throw new ReportContentError("Stored report content is invalid");
    }
    return report;
  }

  async generate(
    context: AuthContext,
    input: { provider: ReportProvider; rangeStart: Date; rangeEnd: Date },
    idempotencyKey: string,
  ) {
    requireWriteRole(context);
    const key = normalizeKey(idempotencyKey);
    const claim = await this.idempotency.claim(context, {
      operation: "report.generate",
      key,
      request: input,
      ttlMs: 7 * 24 * 60 * 60 * 1_000,
    });
    if (claim.state === "completed") {
      const reportId = claim.record.response?.reportId;
      if (typeof reportId !== "string")
        throw new ReportContentError("Stored report response is invalid");
      return { report: await this.get(context, reportId), replayed: true } as const;
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError("A report request with this key is unresolved");
    }

    let pendingId: string | undefined;
    try {
      const summary = await this.workspaceService.getWorkspaceDashboard(context, input);
      let generator: Generator;
      let model: string;
      if (input.provider === "openai") {
        const configured = await this.credentials.getDecrypted(context, "openai");
        model = configured.credential.model;
        generator = this.openAiFactory(configured.secret, model);
      } else {
        model = "deterministic-v1";
        generator = { generate: async (facts) => ({ content: buildLocalReport(facts) }) };
      }

      const pending = await this.database.transaction(async (transaction) => {
        const reports = new ReportRepository(transaction);
        const audits = new AuditRepository(transaction);
        const report = await reports.createPending(context, {
          title: `CFO report · ${input.rangeStart.toISOString().slice(0, 10)} to ${input.rangeEnd.toISOString().slice(0, 10)}`,
          provider: input.provider,
          model,
          promptVersion: PROMPT_VERSION,
          createdBy: context.userId,
        });
        await audits.record(context, {
          actorUserId: context.userId,
          action: "report.generation_started",
          entityType: "report",
          entityId: report.id,
          source: "web",
          idempotencyKey: key,
          payload: {
            provider: input.provider,
            model,
            rangeStart: input.rangeStart,
            rangeEnd: input.rangeEnd,
          },
        });
        return report;
      });
      pendingId = pending.id;

      const generated = await generator.generate(summary);
      const content = aiReportContentSchema.parse(generated.content);
      if (input.provider === "openai") {
        await this.credentials.markStatus(context, { provider: "openai", status: "valid" });
      }
      const report = await this.database.transaction(async (transaction) => {
        const reports = new ReportRepository(transaction);
        const audits = new AuditRepository(transaction);
        const idempotency = new IdempotencyRepository(transaction);
        const completed = await reports.complete(context, { reportId: pending.id, content });
        await audits.record(context, {
          actorUserId: context.userId,
          action: "report.generated",
          entityType: "report",
          entityId: completed.id,
          source: "web",
          idempotencyKey: key,
          payload: {
            provider: input.provider,
            model,
            responseId: generated.responseId,
            usage: generated.usage,
          },
        });
        await idempotency.complete(context, {
          id: claim.record.id,
          response: { reportId: completed.id },
        });
        return completed;
      });
      return { report, replayed: false } as const;
    } catch (error) {
      const errorCode =
        error instanceof AiProviderResponseError
          ? error.code
          : error instanceof Error
            ? error.name
            : "UNKNOWN_ERROR";
      if (pendingId) await this.reports.fail(context, { reportId: pendingId, errorCode });
      await this.idempotency.fail(context, { id: claim.record.id, errorCode });
      if (
        input.provider === "openai" &&
        error instanceof AiProviderResponseError &&
        error.code === "authentication"
      ) {
        try {
          await this.credentials.markStatus(context, {
            provider: "openai",
            status: "invalid",
            errorCode,
          });
        } catch (statusError) {
          console.error("Failed to mark rejected AI credential", { statusError });
        }
      }
      throw error;
    }
  }
}
