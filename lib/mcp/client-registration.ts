import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import type { AppDatabase } from "@/lib/db/database";
import { oauthClients } from "@/lib/db/schema";
import { MCP_SUPPORTED_SCOPES } from "@/lib/mcp/oauth";

const supportedScopes = new Set<string>(MCP_SUPPORTED_SCOPES);
const defaultScope = MCP_SUPPORTED_SCOPES.join(" ");

function redirectUriSchema() {
  return z
    .string()
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, "Redirect URI must use http or https")
    .refine((value) => {
      const url = new URL(value);
      return url.protocol !== "http:" || isLoopbackHost(url.hostname);
    }, "HTTP redirect URI must use loopback host");
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

const registrationRequestSchema = z.object({
  client_name: z.string().trim().min(1).max(120).optional(),
  redirect_uris: z.array(redirectUriSchema()).min(1).max(10),
  grant_types: z.array(z.literal("authorization_code")).min(1).default(["authorization_code"]),
  response_types: z.array(z.literal("code")).min(1).default(["code"]),
  token_endpoint_auth_method: z.literal("none").default("none"),
  scope: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || defaultScope)
    .refine(
      (value) => value.split(/\s+/).every((scope) => supportedScopes.has(scope)),
      "Requested scope is not supported",
    ),
});

export type OAuthClientRegistrationRequest = z.input<typeof registrationRequestSchema>;

export type OAuthClientRegistrationResponse = {
  client_id: string;
  client_id_issued_at: number;
  client_name?: string;
  redirect_uris: string[];
  grant_types: ["authorization_code"];
  response_types: ["code"];
  token_endpoint_auth_method: "none";
  scope: string;
};

export class OAuthClientRegistrationService {
  constructor(private readonly database: AppDatabase) {}

  async register(input: unknown): Promise<OAuthClientRegistrationResponse> {
    const parsed = registrationRequestSchema.parse(input);
    const now = new Date();
    const clientId = `mcp_client_${randomBytes(24).toString("base64url")}`;

    const [client] = await this.database
      .insert(oauthClients)
      .values({
        id: randomUUID(),
        clientId,
        clientName: parsed.client_name,
        redirectUris: parsed.redirect_uris,
        grantTypes: parsed.grant_types,
        responseTypes: parsed.response_types,
        tokenEndpointAuthMethod: parsed.token_endpoint_auth_method,
        scope: parsed.scope,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!client) throw new Error("OAuth client insert returned no row");
    return toRegistrationResponse(client);
  }

  async getByClientId(clientId: string) {
    const [client] = await this.database
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    return client ?? null;
  }
}

function toRegistrationResponse(
  client: typeof oauthClients.$inferSelect,
): OAuthClientRegistrationResponse {
  return {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    ...(client.clientName ? { client_name: client.clientName } : {}),
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: client.scope,
  };
}
