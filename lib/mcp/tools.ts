import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import { ARC_TESTNET_CHAIN_ID } from "@/lib/arc/evidence-config";
import type { McpAuthContext } from "@/lib/mcp/oauth";
import type { ReportService } from "@/lib/reports/service";

type McpDependencies = {
  workspace: WorkspaceApplicationService;
  reports: ReportService;
};

type McpScope =
  | "wallets:read"
  | "wallets:write"
  | "analytics:read"
  | "budgets:read"
  | "budgets:write"
  | "reports:read";

const legacyScopes: Record<McpScope, string[]> = {
  "wallets:read": ["agent-cfo:read"],
  "wallets:write": ["agent-cfo:write"],
  "analytics:read": ["agent-cfo:read"],
  "budgets:read": ["agent-cfo:read"],
  "budgets:write": ["agent-cfo:write"],
  "reports:read": ["agent-cfo:reports", "agent-cfo:write"],
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

function requireScope(context: McpAuthContext, scope: McpScope) {
  if (
    !context.scopes.has(scope) &&
    !legacyScopes[scope].some((legacyScope) => context.scopes.has(legacyScope))
  ) {
    throw new Error(`OAuth token does not grant ${scope}`);
  }
}

const rangeSchema = {
  rangeStart: z.string().datetime().optional().describe("Inclusive ISO-8601 range start"),
  rangeEnd: z.string().datetime().optional().describe("Exclusive ISO-8601 range end"),
};

const watchedWalletCapabilities = {
  observable: true,
  ownershipVerified: false,
  userSignable: false,
  agentExecutable: false,
  policyEnforceable: false,
};

export function createAgentCfoMcpServer(context: McpAuthContext, dependencies: McpDependencies) {
  const server = new McpServer(
    { name: "agent-cfo-for-arc", version: "1.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "list_wallets",
    {
      title: "List workspace wallets",
      description:
        "Lists wallets in the token-selected workspace with capabilities and sync state.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      requireScope(context, "wallets:read");
      return jsonResult(await dependencies.workspace.listWallets(context));
    },
  );

  server.registerTool(
    "get_wallet",
    {
      title: "Get a workspace wallet",
      description: "Returns one wallet from the token-selected workspace by its internal ID.",
      inputSchema: { walletId: z.string().uuid() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ walletId }) => {
      requireScope(context, "wallets:read");
      return jsonResult(await dependencies.workspace.getWallet(context, walletId));
    },
  );

  server.registerTool(
    "add_watched_wallet",
    {
      title: "Add a watched Arc wallet",
      description:
        "Adds an observable, non-custodial Arc Testnet wallet. This grants no signing or execution capability.",
      inputSchema: {
        address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        label: z.string().trim().min(1).max(120),
        idempotencyKey: z.string().trim().min(1).max(255),
        isPrimary: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "wallets:write");
      return jsonResult(
        await dependencies.workspace.createWallet(
          context,
          {
            address: input.address,
            chainId: ARC_TESTNET_CHAIN_ID,
            source: "external",
            label: input.label,
            isPrimary: input.isPrimary,
            ownershipStatus: "unverified",
            capabilities: watchedWalletCapabilities,
          },
          input.idempotencyKey,
          "mcp",
        ),
      );
    },
  );

  server.registerTool(
    "analyze_wallet",
    {
      title: "Analyze one wallet",
      description:
        "Returns exact spend, budget, provider, category, and task aggregates for one workspace wallet.",
      inputSchema: { walletId: z.string().uuid(), ...rangeSchema },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "analytics:read");
      return jsonResult(
        await dependencies.workspace.getWalletSummary(context, {
          walletId: input.walletId,
          ...reportingRange(input),
        }),
      );
    },
  );

  server.registerTool(
    "get_spend_summary",
    {
      title: "Get spend summary",
      description:
        "Returns exact tenant-scoped spend, budget, provider, category, task, and risk aggregates.",
      inputSchema: rangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "analytics:read");
      return jsonResult(
        await dependencies.workspace.getWorkspaceSummary(context, reportingRange(input)),
      );
    },
  );

  server.registerTool(
    "list_payments",
    {
      title: "List observed payments",
      description:
        "Lists tenant-scoped persisted payment events. This tool never authorizes or executes payments.",
      inputSchema: {
        walletId: z.string().uuid().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().positive().max(500).default(100),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "analytics:read");
      return jsonResult(
        await dependencies.workspace.listPayments(context, {
          walletId: input.walletId,
          from: input.from ? new Date(input.from) : undefined,
          to: input.to ? new Date(input.to) : undefined,
          limit: input.limit,
        }),
      );
    },
  );

  server.registerTool(
    "list_risks",
    {
      title: "List financial risks",
      description: "Lists tenant-scoped risk signals and their investigation status.",
      inputSchema: {
        status: z.enum(["open", "investigating", "resolved"]).optional(),
        severity: z.enum(["low", "medium", "high"]).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "analytics:read");
      return jsonResult(await dependencies.workspace.listRisks(context, input));
    },
  );

  server.registerTool(
    "get_budgets",
    {
      title: "Get monitoring budgets",
      description:
        "Lists workspace, wallet, task, and provider monitoring budgets. Budgets do not imply onchain enforcement.",
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      requireScope(context, "budgets:read");
      return jsonResult(await dependencies.workspace.listBudgets(context));
    },
  );

  server.registerTool(
    "set_monitoring_budget",
    {
      title: "Set a monitoring budget",
      description:
        "Creates an audited monitoring budget. It alerts on spend but does not block transactions.",
      inputSchema: {
        walletId: z.string().uuid().optional(),
        taskId: z.string().uuid().optional(),
        providerId: z.string().trim().min(1).max(200).optional(),
        periodType: z.enum(["task", "daily", "weekly", "monthly", "custom"]),
        periodStart: z.string().datetime(),
        periodEnd: z.string().datetime(),
        amount: z.string().regex(/^\d+(?:\.\d{1,6})?$/),
        warningThreshold: z.number().positive().max(100).default(80),
        idempotencyKey: z.string().trim().min(1).max(255),
      },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (input) => {
      requireScope(context, "budgets:write");
      return jsonResult(
        await dependencies.workspace.createBudget(
          context,
          {
            walletId: input.walletId,
            taskId: input.taskId,
            providerId: input.providerId,
            periodType: input.periodType,
            periodStart: new Date(input.periodStart),
            periodEnd: new Date(input.periodEnd),
            amount: input.amount,
            warningThreshold: input.warningThreshold,
            hardLimitRequested: false,
          },
          input.idempotencyKey,
          "mcp",
        ),
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
      requireScope(context, "reports:read");
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
