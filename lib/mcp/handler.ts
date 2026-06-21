import "server-only";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { getWorkspaceApplicationService } from "@/lib/application/server";
import {
  McpAuthenticationRequiredError,
  McpAuthorizationError,
  McpOAuthNotConfiguredError,
  mcpPublicUrl,
} from "@/lib/mcp/oauth";
import { getMcpOAuthService } from "@/lib/mcp/server";
import { createAgentCfoMcpServer } from "@/lib/mcp/tools";
import { getReportService } from "@/lib/reports/server";
import { RateLimitExceededError, RateLimitNotConfiguredError } from "@/lib/security/rate-limit";
import { enforceWorkspaceRateLimit } from "@/lib/security/server";
import { logError } from "@/lib/operations/logger";

function allowedOrigins() {
  return new Set(
    (process.env.MCP_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function validateOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (!allowedOrigins().has(origin))
    throw new McpAuthorizationError("Request origin is not allowed");
}

function challenge() {
  return `Bearer resource_metadata="${mcpPublicUrl()}/.well-known/oauth-protected-resource/mcp", scope="agent-cfo:read"`;
}

export async function handleMcpRequest(request: Request) {
  try {
    validateOrigin(request);
    const context = await getMcpOAuthService().resolve(request);
    await enforceWorkspaceRateLimit(context, "mcp.request", { limit: 120 });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createAgentCfoMcpServer(context, {
      workspace: getWorkspaceApplicationService(),
      reports: getReportService(),
    });
    await server.connect(transport);
    return await transport.handleRequest(request, {
      authInfo: {
        token: "validated",
        clientId: "oauth-client",
        scopes: [...context.scopes],
        resource: new URL(`${mcpPublicUrl()}/mcp`),
        extra: { userId: context.userId, workspaceId: context.workspaceId },
      },
    });
  } catch (error) {
    if (error instanceof McpAuthenticationRequiredError) {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32001, message: error.message }, id: null },
        { status: 401, headers: { "WWW-Authenticate": challenge() } },
      );
    }
    if (error instanceof McpAuthorizationError) {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32003, message: error.message }, id: null },
        { status: 403 },
      );
    }
    if (error instanceof McpOAuthNotConfiguredError) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "MCP authorization is not configured" },
          id: null,
        },
        { status: 503 },
      );
    }
    if (error instanceof RateLimitExceededError) {
      return Response.json(
        { jsonrpc: "2.0", error: { code: -32029, message: error.message }, id: null },
        { status: 429, headers: { "Retry-After": error.retryAfterSeconds.toString() } },
      );
    }
    if (error instanceof RateLimitNotConfiguredError) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32000, message: "MCP rate limiting is not configured" },
          id: null,
        },
        { status: 503 },
      );
    }
    const requestId = crypto.randomUUID();
    logError("mcp.unhandled_error", error, { requestId });
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP error", data: { requestId } },
        id: null,
      },
      { status: 500 },
    );
  }
}
