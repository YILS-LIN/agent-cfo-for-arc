import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoOutputGeneratedError, Output, RetryError, generateText } from "ai";
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

type StructuredResponse = {
  id: string;
  output: AiReportContent | null;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
};

type StructuredClient = {
  generate(input: {
    model: string;
    system: string;
    prompt: string;
    store: false;
    reasoningEffort: "low";
    textVerbosity: "low";
  }): Promise<StructuredResponse>;
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
  private readonly client: StructuredClient;

  constructor(
    apiKey: string,
    private readonly model: string,
    client?: StructuredClient,
  ) {
    const provider = createOpenAI({ apiKey });
    this.client =
      client ??
      ({
        generate: async (input) => {
          const result = await generateText({
            model: provider.responses(input.model),
            output: Output.object({ schema: aiReportContentSchema }),
            system: input.system,
            prompt: input.prompt,
            maxRetries: 2,
            timeout: 45_000,
            providerOptions: {
              openai: {
                store: input.store,
                reasoningEffort: input.reasoningEffort,
                textVerbosity: input.textVerbosity,
              },
            },
          });
          return {
            id: result.response.id,
            output: result.output,
            usage: {
              input_tokens: result.usage.inputTokens,
              output_tokens: result.usage.outputTokens,
              total_tokens: result.usage.totalTokens,
            },
          };
        },
      } satisfies StructuredClient);
  }

  async generate(summary: AgentSpendSummary) {
    try {
      const response = await this.client.generate({
        model: this.model,
        store: false,
        reasoningEffort: "low",
        textVerbosity: "low",
        system:
          "Produce a concise CFO report from the supplied financial facts. Every numeric claim must be directly supported by those facts. Do not invent causes, savings, payment authorization, or enforcement. Put uncertainty and missing context in caveats.",
        prompt: JSON.stringify(reportFacts(summary)),
      });
      if (!response.output) {
        throw new AiProviderResponseError("OpenAI returned no structured report", "invalid_output");
      }
      return {
        content: aiReportContentSchema.parse(response.output),
        responseId: response.id,
        usage: response.usage ?? undefined,
      };
    } catch (error) {
      if (error instanceof AiProviderResponseError) throw error;
      const cause = RetryError.isInstance(error) ? error.lastError : error;
      if (NoOutputGeneratedError.isInstance(cause)) {
        throw new AiProviderResponseError("OpenAI returned no structured report", "invalid_output");
      }
      if (APICallError.isInstance(cause)) {
        if (cause.statusCode === 401 || cause.statusCode === 403) {
          throw new AiProviderResponseError("OpenAI credential was rejected", "authentication");
        }
        if (cause.statusCode === 429) {
          throw new AiProviderResponseError("OpenAI rate limit was reached", "rate_limit");
        }
      }
      throw new AiProviderResponseError("OpenAI report generation failed", "unavailable");
    }
  }
}
