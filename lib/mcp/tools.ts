import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { McpAuthContext } from "@/lib/mcp/oauth";
import type { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import type { ReportService } from "@/lib/reports/service";

type McpDependencies = {
  workspace: WorkspaceApplicationService;
  reports: ReportService;
};

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function reportingRange(input: { rangeStart?: string; rangeEnd?: string }) {
  const rangeEnd = input.rangeEnd ? new Date(input.rangeEnd) : new Date();
  const rangeStart = input.rangeStart
    ? new Date(input.rangeStart)
    : new Date(rangeEnd.getTime() - 30 * 24 * 60 * 60 * 1_000);
  return { rangeStart, rangeEnd };
}

function requireWriteScope(context: McpAuthContext) {
  if (!context.scopes.has("agent-cfo:write")) {
    throw new Error("OAuth token does not grant agent-cfo:write");
  }
}

const rangeSchema = {
  rangeStart: z.string().datetime().optional().describe("Inclusive ISO-8601 range start"),
  rangeEnd: z.string().datetime().optional().describe("Exclusive ISO-8601 range end"),
};

export function createAgentCfoMcpServer(context: McpAuthContext, dependencies: McpDependencies) {
  const server = new McpServer(
    { name: "agent-cfo-for-arc", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_workspace_summary",
    {
      title: "Get workspace financial summary",
      description:
        "Returns exact tenant-scoped spend, budget, provider, category, task, and risk aggregates.",
      inputSchema: rangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) =>
      jsonResult(await dependencies.workspace.getWorkspaceSummary(context, reportingRange(input))),
  );

  server.registerTool(
    "list_payments",
    {
      title: "List observed payments",
      description:
        "Lists tenant-scoped persisted payment events. This does not authorize payments.",
      inputSchema: {
        walletId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().positive().max(500).default(100),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) =>
      jsonResult(
        await dependencies.workspace.listPayments(context, {
          walletId: input.walletId,
          from: input.from ? new Date(input.from) : undefined,
          to: input.to ? new Date(input.to) : undefined,
          limit: input.limit,
        }),
      ),
  );

  server.registerTool(
    "analyze_workspace_risks",
    {
      title: "Analyze workspace risks",
      description:
        "Runs deterministic risk rules over persisted workspace facts and records an audited snapshot.",
      inputSchema: rangeSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireWriteScope(context);
      return jsonResult(
        await dependencies.workspace.analyzeRisks(context, reportingRange(input), "mcp"),
      );
    },
  );

  server.registerTool(
    "generate_cfo_report",
    {
      title: "Generate CFO report",
      description:
        "Generates and persists an audited local or OpenAI BYOK report from tenant-scoped aggregates.",
      inputSchema: {
        provider: z.enum(["local", "openai"]),
        idempotencyKey: z.string().trim().min(1).max(255),
        ...rangeSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireWriteScope(context);
      return jsonResult(
        await dependencies.reports.generate(
          context,
          { provider: input.provider, ...reportingRange(input) },
          input.idempotencyKey,
          "mcp",
        ),
      );
    },
  );

  return server;
}
