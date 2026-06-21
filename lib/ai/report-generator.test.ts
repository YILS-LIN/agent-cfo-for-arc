import { describe, expect, it } from "vitest";

import {
  AiProviderResponseError,
  OpenAiReportGenerator,
  type AiReportContent,
} from "@/lib/ai/report-generator";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";

const content: AiReportContent = {
  headline: "Spend remained within budget",
  executiveSummary: "Persisted payments used less than the assigned budget.",
  findings: [],
  recommendations: [],
  caveats: ["The report is limited to ingested events."],
};

describe("OpenAiReportGenerator", () => {
  it("requests non-retained structured output and returns validated content", async () => {
    let request: Record<string, unknown> | undefined;
    const generator = new OpenAiReportGenerator("test-key", "gpt-test", {
      async generate(input) {
        request = input;
        return { id: "resp_123", output: content, usage: { total_tokens: 42 } };
      },
    });

    await expect(generator.generate(buildAgentSpendSummary())).resolves.toMatchObject({
      content,
      responseId: "resp_123",
      usage: { total_tokens: 42 },
    });
    expect(request).toMatchObject({
      model: "gpt-test",
      store: false,
      reasoningEffort: "low",
      textVerbosity: "low",
    });
  });

  it("rejects a response without parsed structured output", async () => {
    const generator = new OpenAiReportGenerator("test-key", "gpt-test", {
      async generate() {
        return { id: "resp_empty", output: null };
      },
    });

    await expect(generator.generate(buildAgentSpendSummary())).rejects.toMatchObject({
      code: "invalid_output",
    } satisfies Partial<AiProviderResponseError>);
  });
});
