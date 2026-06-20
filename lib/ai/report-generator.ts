import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import type { AgentSpendSummary } from "@/types/agent";

export const aiReportContentSchema = z.object({
  headline: z.string().min(1).max(240),
  executiveSummary: z.string().min(1).max(2_000),
  findings: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        evidence: z.string().min(1).max(800),
        impact: z.string().min(1).max(800),
      }),
    )
    .max(8),
  recommendations: z
    .array(
      z.object({
        action: z.string().min(1).max(240),
        rationale: z.string().min(1).max(800),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(8),
  caveats: z.array(z.string().min(1).max(500)).max(8),
});

export type AiReportContent = z.infer<typeof aiReportContentSchema>;

export class AiProviderResponseError extends Error {
  constructor(
    message: string,
    readonly code: "refused" | "invalid_output" | "authentication" | "rate_limit" | "unavailable",
  ) {
    super(message);
  }
}

type ParsedResponse = {
  id: string;
  output_parsed: AiReportContent | null;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
};

type ResponsesClient = {
  parse(input: Record<string, unknown>): Promise<ParsedResponse>;
};

function reportFacts(summary: AgentSpendSummary) {
  return {
    reportingRange: summary.profile.dateRange,
    metrics: summary.metrics,
    budget: summary.profile.budget,
    providers: summary.providers.map((provider) => ({
      name: provider.provider,
      amount: provider.amount,
      paymentCount: provider.paymentCount,
      sharePercent: provider.share,
    })),
    categories: summary.categories.map((category) => ({
      name: category.category,
      amount: category.amount,
      paymentCount: category.paymentCount,
      sharePercent: category.share,
    })),
    tasks: summary.tasks.map((task) => ({
      name: task.name,
      amount: task.amount,
      budget: task.budget,
      paymentCount: task.paymentCount,
      status: task.status,
    })),
    risks: summary.risks.map((risk) => ({
      title: risk.title,
      description: risk.description,
      severity: risk.severity,
      category: risk.category,
    })),
  };
}

export class OpenAiReportGenerator {
  private readonly responses: ResponsesClient;

  constructor(
    apiKey: string,
    private readonly model: string,
    responses?: ResponsesClient,
  ) {
    this.responses =
      responses ??
      (new OpenAI({ apiKey, timeout: 45_000, maxRetries: 2 })
        .responses as unknown as ResponsesClient);
  }

  async generate(summary: AgentSpendSummary) {
    try {
      const response = await this.responses.parse({
        model: this.model,
        store: false,
        reasoning: { effort: "low" },
        text: {
          verbosity: "low",
          format: zodTextFormat(aiReportContentSchema, "agent_cfo_report"),
        },
        input: [
          {
            role: "system",
            content:
              "Produce a concise CFO report from the supplied financial facts. Every numeric claim must be directly supported by those facts. Do not invent causes, savings, payment authorization, or enforcement. Put uncertainty and missing context in caveats.",
          },
          {
            role: "user",
            content: JSON.stringify(reportFacts(summary)),
          },
        ],
      });
      if (!response.output_parsed) {
        throw new AiProviderResponseError("OpenAI returned no structured report", "invalid_output");
      }
      return {
        content: aiReportContentSchema.parse(response.output_parsed),
        responseId: response.id,
        usage: response.usage ?? undefined,
      };
    } catch (error) {
      if (error instanceof AiProviderResponseError) throw error;
      if (error instanceof OpenAI.AuthenticationError) {
        throw new AiProviderResponseError("OpenAI credential was rejected", "authentication");
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new AiProviderResponseError("OpenAI rate limit was reached", "rate_limit");
      }
      throw new AiProviderResponseError("OpenAI report generation failed", "unavailable");
    }
  }
}
