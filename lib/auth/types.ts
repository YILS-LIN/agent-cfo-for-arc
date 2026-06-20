export type ExternalIdentity = {
  provider: "privy_user" | "privy_google" | "privy_wallet";
  subject: string;
  address?: `0x${string}`;
  email?: string;
  name?: string;
};

export type ExternalSession = {
  providerUserId: string;
  sessionId: string;
  identities: ExternalIdentity[];
};

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "operator" | "viewer";
  identities: Array<{
    type: "google" | "wallet";
    subject: string;
    address?: `0x${string}`;
  }>;
};

export interface AuthProvider {
  verifyWebSession(request: Request): Promise<ExternalSession | null>;
}

export class AuthenticationRequiredError extends Error {}
export class AuthenticationNotConfiguredError extends Error {}
export class WorkspaceAccessDeniedError extends Error {}
export class IdentityConflictError extends Error {}
