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
  scopes: new Set(["agent-cfo:read", "agent-cfo:write"]),
};

describe("Agent CFO MCP tools", () => {
  const clients: Client[] = [];
  const servers: ReturnType<typeof createAgentCfoMcpServer>[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function connect(scopes = context.scopes) {
    const getWorkspaceSummary = vi.fn(async () => ({ totalSpend: "12.5" }));
    const listPayments = vi.fn(async () => [{ id: "payment-1", amount: "1" }]);
    const analyzeRisks = vi.fn(async () => ({ replayed: false, signals: [] }));
    const generate = vi.fn(async () => ({ report: { id: "report-1" }, replayed: false }));
    const workspace = {
      getWorkspaceSummary,
      listPayments,
      analyzeRisks,
    } as unknown as WorkspaceApplicationService;
    const reports = { generate } as unknown as ReportService;
    const server = createAgentCfoMcpServer({ ...context, scopes }, { workspace, reports });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    servers.push(server);
    clients.push(client);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, getWorkspaceSummary, analyzeRisks, generate };
  }

  it("publishes read and write tools and returns tenant-scoped summaries", async () => {
    const { client, getWorkspaceSummary } = await connect();
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "get_workspace_summary",
      "list_payments",
      "analyze_workspace_risks",
      "generate_cfo_report",
    ]);

    const result = await client.callTool({ name: "get_workspace_summary", arguments: {} });
    expect(result).toMatchObject({ content: [{ type: "text", text: '{"totalSpend":"12.5"}' }] });
    expect(getWorkspaceSummary).toHaveBeenCalledWith(context, expect.any(Object));
  });

  it("marks MCP mutations with the MCP audit source", async () => {
    const { client, analyzeRisks, generate } = await connect();
    await client.callTool({ name: "analyze_workspace_risks", arguments: {} });
    await client.callTool({
      name: "generate_cfo_report",
      arguments: { provider: "local", idempotencyKey: "mcp-report-1" },
    });

    expect(analyzeRisks).toHaveBeenCalledWith(context, expect.any(Object), "mcp");
    expect(generate).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ provider: "local" }),
      "mcp-report-1",
      "mcp",
    );
  });

  it("rejects write tools when the OAuth token only grants read access", async () => {
    const { client, analyzeRisks } = await connect(new Set(["agent-cfo:read"]));
    const result = await client.callTool({ name: "analyze_workspace_risks", arguments: {} });

    expect(result).toMatchObject({ isError: true });
    expect(analyzeRisks).not.toHaveBeenCalled();
  });
});
