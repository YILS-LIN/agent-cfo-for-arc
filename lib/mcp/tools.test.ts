import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import type { McpAuthContext } from "@/lib/mcp/oauth";
import { createAgentCfoMcpServer } from "@/lib/mcp/tools";
import type { ReportService } from "@/lib/reports/service";

const context: McpAuthContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  role: "owner",
  identities: [],
  scopes: new Set([
    "wallets:read",
    "wallets:write",
    "analytics:read",
    "budgets:read",
    "budgets:write",
    "reports:read",
  ]),
};

describe("Agent CFO MCP tools", () => {
  const clients: Client[] = [];
  const servers: ReturnType<typeof createAgentCfoMcpServer>[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function connect(scopes = context.scopes) {
    const listWallets = vi.fn(async (authContext: McpAuthContext) => {
      void authContext;
      return [{ id: "wallet-1", label: "Agent" }];
    });
    const getWallet = vi.fn(async (authContext: McpAuthContext, walletId: string) => {
      void authContext;
      void walletId;
      return { id: "wallet-1", label: "Agent" };
    });
    const createWallet = vi.fn(async (...args: unknown[]) => {
      void args;
      return { wallet: { id: "wallet-1" }, replayed: false };
    });
    const getWalletSummary = vi.fn(async (...args: unknown[]) => {
      void args;
      return { summary: { totalSpend: "4" } };
    });
    const getWorkspaceSummary = vi.fn(async (...args: unknown[]) => {
      void args;
      return { totalSpend: "12.5" };
    });
    const listPayments = vi.fn(async (...args: unknown[]) => {
      void args;
      return [{ id: "payment-1", amount: "1" }];
    });
    const listRisks = vi.fn(async (...args: unknown[]) => {
      void args;
      return [{ id: "risk-1", severity: "high" }];
    });
    const listBudgets = vi.fn(async (authContext: McpAuthContext) => {
      void authContext;
      return [{ id: "budget-1", amount: "10" }];
    });
    const createBudget = vi.fn(async (...args: unknown[]) => {
      void args;
      return { budget: { id: "budget-1" }, replayed: false };
    });
    const generate = vi.fn(async (...args: unknown[]) => {
      void args;
      return { report: { id: "report-1" }, replayed: false };
    });
    const workspace = {
      listWallets,
      getWallet,
      createWallet,
      getWalletSummary,
      getWorkspaceSummary,
      listPayments,
      listRisks,
      listBudgets,
      createBudget,
    } as unknown as WorkspaceApplicationService;
    const reports = { generate } as unknown as ReportService;
    const server = createAgentCfoMcpServer({ ...context, scopes }, { workspace, reports });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return {
      client,
      listWallets,
      getWallet,
      createWallet,
      getWalletSummary,
      getWorkspaceSummary,
      listPayments,
      listRisks,
      listBudgets,
      createBudget,
      generate,
    };
  }

  it("publishes the complete first-stage wallet, analytics, budget, and report surface", async () => {
    const { client } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_wallets",
      "get_wallet",
      "add_watched_wallet",
      "analyze_wallet",
      "get_spend_summary",
      "list_payments",
      "list_risks",
      "get_budgets",
      "set_monitoring_budget",
      "generate_cfo_report",
    ]);
  });

  it("routes read tools through the token-derived workspace context", async () => {
    const {
      client,
      listWallets,
      getWallet,
      getWalletSummary,
      getWorkspaceSummary,
      listPayments,
      listRisks,
      listBudgets,
    } = await connect();
    await client.callTool({ name: "list_wallets", arguments: {} });
    await client.callTool({
      name: "get_wallet",
      arguments: { walletId: "00000000-0000-4000-8000-000000000010" },
    });
    await client.callTool({
      name: "analyze_wallet",
      arguments: { walletId: "00000000-0000-4000-8000-000000000010" },
    });
    const summary = await client.callTool({ name: "get_spend_summary", arguments: {} });
    await client.callTool({ name: "list_payments", arguments: {} });
    await client.callTool({ name: "list_risks", arguments: { severity: "high" } });
    await client.callTool({ name: "get_budgets", arguments: {} });

    expect(summary).toMatchObject({ content: [{ type: "text", text: '{"totalSpend":"12.5"}' }] });
    for (const call of [
      listWallets,
      getWallet,
      getWalletSummary,
      getWorkspaceSummary,
      listPayments,
      listRisks,
      listBudgets,
    ]) {
      expect(call.mock.calls[0]?.[0]).toEqual(context);
    }
  });

  it("marks every MCP mutation with idempotency and the MCP audit source", async () => {
    const { client, createWallet, createBudget, generate } = await connect();
    await client.callTool({
      name: "add_watched_wallet",
      arguments: {
        address: "0x1111111111111111111111111111111111111111",
        label: "Observed agent",
        idempotencyKey: "mcp-wallet-1",
      },
    });
    await client.callTool({
      name: "set_monitoring_budget",
      arguments: {
        periodType: "monthly",
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-07-01T00:00:00.000Z",
        amount: "100",
        idempotencyKey: "mcp-budget-1",
      },
    });
    await client.callTool({
      name: "generate_cfo_report",
      arguments: { provider: "local", idempotencyKey: "mcp-report-1" },
    });

    expect(createWallet).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        source: "external",
        capabilities: expect.objectContaining({ observable: true, userSignable: false }),
      }),
      "mcp-wallet-1",
      "mcp",
    );
    expect(createBudget).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ amount: "100", hardLimitRequested: false }),
      "mcp-budget-1",
      "mcp",
    );
    expect(generate).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ provider: "local" }),
      "mcp-report-1",
      "mcp",
    );
  });

  it("enforces granular scopes without accepting workspace overrides", async () => {
    const { client, createWallet, listPayments } = await connect(new Set(["wallets:read"]));
    const deniedWrite = await client.callTool({
      name: "add_watched_wallet",
      arguments: {
        address: "0x1111111111111111111111111111111111111111",
        label: "Observed agent",
        idempotencyKey: "denied-wallet",
      },
    });
    const deniedAnalytics = await client.callTool({ name: "list_payments", arguments: {} });

    expect(deniedWrite).toMatchObject({ isError: true });
    expect(deniedAnalytics).toMatchObject({ isError: true });
    expect(createWallet).not.toHaveBeenCalled();
    expect(listPayments).not.toHaveBeenCalled();

    const tools = await client.listTools();
    const walletSchema = tools.tools.find(
      (tool) => tool.name === "add_watched_wallet",
    )?.inputSchema;
    expect(walletSchema).not.toHaveProperty("properties.workspaceId");
  });

  it("keeps legacy Agent CFO scopes compatible during migration", async () => {
    const { client, getWorkspaceSummary, createBudget } = await connect(
      new Set(["agent-cfo:read", "agent-cfo:write"]),
    );
    await client.callTool({ name: "get_spend_summary", arguments: {} });
    await client.callTool({
      name: "set_monitoring_budget",
      arguments: {
        periodType: "monthly",
        periodStart: "2026-06-01T00:00:00.000Z",
        periodEnd: "2026-07-01T00:00:00.000Z",
        amount: "100",
        idempotencyKey: "legacy-budget",
      },
    });
    expect(getWorkspaceSummary).toHaveBeenCalled();
    expect(createBudget).toHaveBeenCalled();
  });
});
