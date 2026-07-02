import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import { importJWK, SignJWT } from "jose";
import { z } from "zod";

import type { AppDatabase } from "@/lib/db/database";
import { oauthAuthorizationCodes, oauthClients } from "@/lib/db/schema";
import { parseMcpOAuthSigningJwk } from "@/lib/mcp/jwks";

export class OAuthInvalidGrantError extends Error {}
export class OAuthAuthorizationCodeUsedError extends OAuthInvalidGrantError {}

const authorizationCodeInputSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(32),
  codeChallengeMethod: z.literal("S256"),
  privyUserId: z.string().min(1),
  workspaceId: z.string().uuid(),
  scope: z.string().trim().min(1),
});

const tokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(32),
});

export type OAuthAuthorizationCodeInput = z.input<typeof authorizationCodeInputSchema>;
export type OAuthTokenRequest = z.input<typeof tokenRequestSchema>;

export type OAuthTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
};

type OAuthTokenServiceOptions = {
  issuer: string;
  audience: string;
  signingJwk: string;
  now?: () => Date;
  accessTokenTtlSeconds?: number;
  authorizationCodeTtlSeconds?: number;
};

export class OAuthTokenService {
  private readonly now: () => Date;
  private readonly accessTokenTtlSeconds: number;
  private readonly authorizationCodeTtlSeconds: number;

  constructor(
    private readonly database: AppDatabase,
    private readonly options: OAuthTokenServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 900;
    this.authorizationCodeTtlSeconds = options.authorizationCodeTtlSeconds ?? 300;
  }

  async createAuthorizationCode(input: OAuthAuthorizationCodeInput) {
    const parsed = authorizationCodeInputSchema.parse(input);
    await this.requireRegisteredClient(parsed.clientId, parsed.redirectUri);
    const code = `mcp_code_${randomBytes(32).toString("base64url")}`;
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + this.authorizationCodeTtlSeconds * 1000);

    await this.database.insert(oauthAuthorizationCodes).values({
      id: randomUUID(),
      codeHash: hashToken(code),
      clientId: parsed.clientId,
      redirectUri: parsed.redirectUri,
      codeChallenge: parsed.codeChallenge,
      codeChallengeMethod: parsed.codeChallengeMethod,
      privyUserId: parsed.privyUserId,
      workspaceId: parsed.workspaceId,
      scope: parsed.scope,
      expiresAt,
      createdAt: issuedAt,
    });

    return { code, expiresAt };
  }

  async exchangeAuthorizationCode(input: unknown): Promise<OAuthTokenResponse> {
    const parsed = tokenRequestSchema.parse(input);
    const now = this.now();
    const [authorization] = await this.database
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.codeHash, hashToken(parsed.code)))
      .limit(1);

    if (!authorization) throw new OAuthInvalidGrantError("Authorization code is invalid");
    if (authorization.consumedAt) {
      throw new OAuthAuthorizationCodeUsedError("Authorization code has already been used");
    }
    if (authorization.expiresAt <= now) {
      throw new OAuthInvalidGrantError("Authorization code has expired");
    }
    if (
      authorization.clientId !== parsed.client_id ||
      authorization.redirectUri !== parsed.redirect_uri
    ) {
      throw new OAuthInvalidGrantError("Authorization code client or redirect URI does not match");
    }
    if (authorization.codeChallenge !== pkceChallenge(parsed.code_verifier)) {
      throw new OAuthInvalidGrantError("PKCE verifier does not match authorization code");
    }

    await this.consumeAuthorizationCode(authorization.id, now);

    return {
      access_token: await this.signAccessToken(authorization, now),
      token_type: "Bearer",
      expires_in: this.accessTokenTtlSeconds,
      scope: authorization.scope,
    };
  }

  private async requireRegisteredClient(clientId: string, redirectUri: string) {
    const [client] = await this.database
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      throw new OAuthInvalidGrantError("OAuth client or redirect URI is not registered");
    }
  }

  private async consumeAuthorizationCode(id: string, consumedAt: Date) {
    const [updated] = await this.database
      .update(oauthAuthorizationCodes)
      .set({ consumedAt })
      .where(and(eq(oauthAuthorizationCodes.id, id), isNull(oauthAuthorizationCodes.consumedAt)))
      .returning({ id: oauthAuthorizationCodes.id });
    if (!updated) {
      throw new OAuthAuthorizationCodeUsedError("Authorization code has already been used");
    }
  }

  private async signAccessToken(
    authorization: typeof oauthAuthorizationCodes.$inferSelect,
    issuedAt: Date,
  ) {
    const signingJwk = parseMcpOAuthSigningJwk(this.options.signingJwk);
    const key = await importJWK(signingJwk, signingJwk.alg);
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
    return new SignJWT({
      scope: authorization.scope,
      privy_user_id: authorization.privyUserId,
      workspace_id: authorization.workspaceId,
    })
      .setProtectedHeader({ alg: signingJwk.alg, kid: signingJwk.kid, typ: "JWT" })
      .setIssuer(this.options.issuer.replace(/\/$/, ""))
      .setAudience(this.options.audience)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(issuedAtSeconds + this.accessTokenTtlSeconds)
      .setJti(randomUUID())
      .sign(key);
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}
