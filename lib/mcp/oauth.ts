import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { identityAccounts, workspaceMembers } from "@/lib/db/schema";

export class McpAuthenticationRequiredError extends Error {}
export class McpAuthorizationError extends Error {}
export class McpOAuthNotConfiguredError extends Error {}

export const MCP_SUPPORTED_SCOPES = [
  "wallets:read",
  "wallets:write",
  "analytics:read",
  "budgets:read",
  "budgets:write",
  "reports:read",
] as const;

const LEGACY_MCP_SCOPES = ["agent-cfo:read", "agent-cfo:write", "agent-cfo:reports"];

export type McpAuthContext = AuthContext & { scopes: ReadonlySet<string> };

type VerifiedToken = { payload: JWTPayload };
type TokenVerifier = (token: string) => Promise<VerifiedToken>;
type TokenRevocationChecker = (payload: JWTPayload) => boolean | Promise<boolean>;

export type McpOAuthServiceOptions = {
  subjectClaim?: string;
  workspaceClaim?: string;
  isTokenRevoked?: TokenRevocationChecker;
};

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new McpAuthenticationRequiredError("OAuth bearer token is required");
  }
  const token = authorization.slice(7).trim();
  if (!token) throw new McpAuthenticationRequiredError("OAuth bearer token is required");
  return token;
}

function tokenScopes(payload: JWTPayload) {
  const value = payload.scope;
  if (typeof value === "string") return new Set(value.split(/\s+/).filter(Boolean));
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
    return new Set(value);
  }
  return new Set<string>();
}

export class McpOAuthService {
  private readonly subjectClaim: string;
  private readonly workspaceClaim: string;
  private readonly isTokenRevoked?: TokenRevocationChecker;

  constructor(
    private readonly database: AppDatabase,
    private readonly verifyToken: TokenVerifier,
    optionsOrSubjectClaim: McpOAuthServiceOptions | string = {},
    legacyWorkspaceClaim = "workspace_id",
  ) {
    const options =
      typeof optionsOrSubjectClaim === "string"
        ? { subjectClaim: optionsOrSubjectClaim, workspaceClaim: legacyWorkspaceClaim }
        : optionsOrSubjectClaim;
    this.subjectClaim = options.subjectClaim ?? "privy_user_id";
    this.workspaceClaim = options.workspaceClaim ?? "workspace_id";
    this.isTokenRevoked = options.isTokenRevoked;
  }

  async resolve(request: Request, requiredScopes?: string[]): Promise<McpAuthContext> {
    let verified: VerifiedToken;
    try {
      verified = await this.verifyToken(bearerToken(request));
    } catch (error) {
      if (error instanceof McpAuthenticationRequiredError) throw error;
      throw new McpAuthenticationRequiredError("OAuth bearer token is invalid or expired");
    }
    if (await this.isTokenRevoked?.(verified.payload)) {
      throw new McpAuthenticationRequiredError("OAuth bearer token is invalid or expired");
    }
    const scopes = tokenScopes(verified.payload);
    if (
      requiredScopes?.some((scope) => !scopes.has(scope)) ||
      (!requiredScopes &&
        ![...MCP_SUPPORTED_SCOPES, ...LEGACY_MCP_SCOPES].some((scope) => scopes.has(scope)))
    ) {
      throw new McpAuthorizationError("OAuth token does not grant the required scope");
    }
    const subject = verified.payload[this.subjectClaim];
    if (typeof subject !== "string" || !subject.trim()) {
      throw new McpAuthorizationError(`OAuth token is missing ${this.subjectClaim}`);
    }
    const [identity] = await this.database
      .select()
      .from(identityAccounts)
      .where(
        and(
          eq(identityAccounts.provider, "privy_user"),
          eq(identityAccounts.providerSubject, subject),
        ),
      )
      .limit(1);
    if (!identity)
      throw new McpAuthorizationError("OAuth subject is not linked to an Agent CFO user");

    const memberships = await this.database
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, identity.userId))
      .orderBy(asc(workspaceMembers.joinedAt));
    const requestedWorkspace = verified.payload[this.workspaceClaim];
    if (requestedWorkspace !== undefined && typeof requestedWorkspace !== "string") {
      throw new McpAuthorizationError(`OAuth token has an invalid ${this.workspaceClaim}`);
    }
    if (!requestedWorkspace && memberships.length !== 1) {
      throw new McpAuthorizationError(`OAuth token must select a ${this.workspaceClaim}`);
    }
    const membership = requestedWorkspace
      ? memberships.find((item) => item.workspaceId === requestedWorkspace)
      : memberships[0];
    if (!membership)
      throw new McpAuthorizationError("OAuth user is not a member of the selected workspace");

    return {
      userId: identity.userId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      identities: [],
      scopes,
    };
  }
}

type JwksResolver = Parameters<typeof jwtVerify>[1];

export function createMcpTokenVerifier(input: {
  issuer: string;
  audience: string;
  jwks: JwksResolver;
}): TokenVerifier {
  const issuer = input.issuer.replace(/\/$/, "");
  return async (token) =>
    jwtVerify(token, input.jwks, {
      issuer,
      audience: input.audience,
      algorithms: ["RS256", "ES256"],
    });
}

function requiredUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new McpOAuthNotConfiguredError(`${name} is required`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new McpOAuthNotConfiguredError(`${name} must be a valid URL`);
  }
  if (
    url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")
  ) {
    throw new McpOAuthNotConfiguredError(`${name} must use HTTPS`);
  }
  return url;
}

export function createMcpTokenVerifierFromEnvironment(): TokenVerifier {
  const issuer = requiredUrl("MCP_OAUTH_ISSUER").toString().replace(/\/$/, "");
  const jwks = createRemoteJWKSet(requiredUrl("MCP_OAUTH_JWKS_URL"));
  const audience = process.env.MCP_OAUTH_AUDIENCE;
  if (!audience) throw new McpOAuthNotConfiguredError("MCP_OAUTH_AUDIENCE is required");
  return createMcpTokenVerifier({ issuer, audience, jwks });
}

export function mcpPublicUrl() {
  return requiredUrl("MCP_PUBLIC_URL").toString().replace(/\/$/, "");
}

export function mcpAuthorizationServer() {
  return requiredUrl("MCP_OAUTH_ISSUER").toString().replace(/\/$/, "");
}
