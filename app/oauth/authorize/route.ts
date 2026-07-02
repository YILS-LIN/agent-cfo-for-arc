import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { getAuthService } from "@/lib/auth/server";
import { getOAuthAuthorizationService } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const workspaces = await getAuthService().listWorkspaces(request);
    const params = new URL(request.url).searchParams;
    return new Response(renderAuthorizationPage(workspaces, params), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = Object.fromEntries(await request.formData());
    const workspaceId = typeof input.workspace_id === "string" ? input.workspace_id : undefined;
    const context = await getAuthService().resolve(request, workspaceId);
    const authorization = await getOAuthAuthorizationService().authorize(context, input);
    return NextResponse.redirect(authorization.redirectTo, 302);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function renderAuthorizationPage(
  workspaces: Array<{ workspaceId: string; name: string; role: string }>,
  params: URLSearchParams,
) {
  const fields = [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
  ];
  const hiddenFields = fields
    .map((field) => {
      const value = params.get(field);
      return value ? `<input type="hidden" name="${field}" value="${escapeHtml(value)}" />` : "";
    })
    .join("");
  const scope = params.get("scope") ?? "";
  const clientId = params.get("client_id") ?? "";
  const workspaceOptions = workspaces
    .map(
      (workspace, index) => `<label>
          <input type="radio" name="workspace_id" value="${escapeHtml(workspace.workspaceId)}"${
            index === 0 ? " checked" : ""
          } />
          ${escapeHtml(workspace.name)} (${escapeHtml(workspace.role)})
        </label>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize MCP access</title>
  </head>
  <body>
    <main>
      <h1>Authorize MCP access</h1>
      <p>Client: ${escapeHtml(clientId)}</p>
      <fieldset>
        <legend>Workspace</legend>
        ${workspaceOptions}
      </fieldset>
      <p>Scope: ${escapeHtml(scope)}</p>
      <form method="post" action="/oauth/authorize">
        ${hiddenFields}
        <button type="submit">Authorize</button>
      </form>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
