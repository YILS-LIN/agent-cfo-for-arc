import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { AuditRepository } from "@/lib/db/repositories";
import { oauthClients } from "@/lib/db/schema";
import { OAuthInvalidGrantError, OAuthTokenService } from "@/lib/mcp/token-service";

const authorizationRequestSchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  scope: z.string().trim().min(1).optional(),
  state: z.string().optional(),
  code_challenge: z.string().min(32),
  code_challenge_method: z.literal("S256"),
});

export type OAuthAuthorizationRequest = z.input<typeof authorizationRequestSchema>;

export type OAuthAuthorizationResult = {
  redirectTo: URL;
  scope: string;
  workspaceId: string;
};

export class OAuthAuthorizationService {
  constructor(
    private readonly database: AppDatabase,
    private readonly tokenService: OAuthTokenService,
  ) {}

  async authorize(context: AuthContext, input: unknown): Promise<OAuthAuthorizationResult> {
    const parsed = authorizationRequestSchema.parse(input);
    const client = await this.getRegisteredClient(parsed.client_id);
    if (!client.redirectUris.includes(parsed.redirect_uri)) {
      throw new OAuthInvalidGrantError("OAuth redirect URI is not registered for this client");
    }

    const scope = parsed.scope ?? client.scope;
    if (!isScopeSubset(scope, client.scope)) {
      throw new OAuthInvalidGrantError("Requested scope is not allowed for this client");
    }
    const privyUserId = context.identities[0]?.subject ?? context.userId;
    const authorization = await this.tokenService.createAuthorizationCode({
      clientId: client.clientId,
      redirectUri: parsed.redirect_uri,
      codeChallenge: parsed.code_challenge,
      codeChallengeMethod: parsed.code_challenge_method,
      privyUserId,
      workspaceId: context.workspaceId,
      scope,
    });
    await new AuditRepository(this.database).record(context, {
      actorUserId: context.userId,
      action: "mcp.oauth.authorized",
      entityType: "oauth_client",
      entityId: client.clientId,
      source: "web",
      payload: {
        scope,
        redirectUri: parsed.redirect_uri,
        codeChallengeMethod: parsed.code_challenge_method,
      },
    });

    const redirectTo = new URL(parsed.redirect_uri);
    redirectTo.searchParams.set("code", authorization.code);
    if (parsed.state) redirectTo.searchParams.set("state", parsed.state);
    return { redirectTo, scope, workspaceId: context.workspaceId };
  }

  private async getRegisteredClient(clientId: string) {
    const [client] = await this.database
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    if (!client) throw new OAuthInvalidGrantError("OAuth client is not registered");
    return client;
  }
}

function isScopeSubset(requested: string, allowed: string) {
  const allowedScopes = new Set(allowed.split(/\s+/).filter(Boolean));
  return requested
    .split(/\s+/)
    .filter(Boolean)
    .every((scope) => allowedScopes.has(scope));
}
