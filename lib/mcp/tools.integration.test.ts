import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import type { McpAuthContext } from "@/lib/mcp/oauth";
import { createAgentCfoMcpServer } from "@/lib/mcp/tools";
import { WorkspaceRepository } from "@/lib/db/repositories";
import { createTestDatabase } from "@/lib/db/testing";
import type { ReportService } from "@/lib/reports/service";

describe("Agent CFO MCP application parity", () => {
  it("returns the same tenant-scoped spend summary as the Web application service", async () => {
    const testDatabase = await createTestDatabase();
    const workspace = new WorkspaceApplicationService(testDatabase.database);
    const scope = await new WorkspaceRepository(testDatabase.database).createPersonalWorkspace({
      displayName: "MCP parity",
      email: "mcp-parity@example.com",
    });
    const context: McpAuthContext = {
      ...scope,
      role: "owner",
      identities: [],
      scopes: new Set(["analytics:read"]),
    };
    const wallet = await workspace.createWallet(
      context,
      {
        address: "0x1111111111111111111111111111111111111111",
        chainId: 5_042_002,
        source: "external",
        label: "Parity wallet",
        capabilities: {
          observable: true,
          ownershipVerified: false,
          userSignable: false,
          agentExecutable: false,
          policyEnforceable: false,
        },
      },
      "parity-wallet",
    );
    await workspace.ingestPayment(context, {
      walletId: wallet.wallet.id,
      externalId: "parity-payment",
      amount: "1.25",
      providerName: "Parity provider",
      category: "Data",
      occurredAt: new Date("2026-06-20T12:00:00.000Z"),
      source: "arc",
    });
    const range = {
      rangeStart: new Date("2026-06-20T00:00:00.000Z"),
      rangeEnd: new Date("2026-06-21T00:00:00.000Z"),
    };
    const expected = await workspace.getWorkspaceSummary(context, range);

    const reports = {} as ReportService;
    const server = createAgentCfoMcpServer(context, { workspace, reports });
    const client = new Client({ name: "parity-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: "get_spend_summary",
        arguments: {
          rangeStart: range.rangeStart.toISOString(),
          rangeEnd: range.rangeEnd.toISOString(),
        },
      });
      const content = result.content as Array<{ type: string; text?: string }>;
      expect(JSON.parse(content[0]?.text ?? "null")).toEqual(expected);
    } finally {
      await client.close();
      await server.close();
      await testDatabase.close();
    }
  }, 15_000);
});
