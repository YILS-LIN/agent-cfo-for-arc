import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const expectedTools = [
  "list_wallets",
  "get_wallet",
  "add_watched_wallet",
  "analyze_wallet",
  "get_spend_summary",
  "list_payments",
  "list_risks",
  "get_budgets",
  "set_monitoring_budget",
  "update_monitoring_budget",
  "generate_cfo_report",
];

if (process.argv.includes("--help")) {
  console.log(`Usage:
  MCP_URL=https://app.example.com/mcp MCP_ACCESS_TOKEN=... pnpm mcp:check

Connects with the standard Streamable HTTP client, verifies the complete tool surface,
and calls the read-only get_spend_summary tool.`);
  process.exit(0);
}

const url = process.env.MCP_URL;
const token = process.env.MCP_ACCESS_TOKEN;
if (!url || !token) {
  throw new Error("MCP_URL and MCP_ACCESS_TOKEN are required");
}

const client = new Client({ name: "agent-cfo-production-check", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  const missing = expectedTools.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`MCP server is missing tools: ${missing.join(", ")}`);
  const summary = await client.callTool({ name: "get_spend_summary", arguments: {} });
  if (summary.isError) throw new Error("get_spend_summary returned an MCP tool error");
  console.log(
    JSON.stringify(
      { connected: true, protocol: "streamable-http", toolCount: names.length, summary: "ok" },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
