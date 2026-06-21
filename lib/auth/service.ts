import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  AuthenticationRequiredError,
  IdentityConflictError,
  WorkspaceAccessDeniedError,
  type AuthContext,
  type AuthProvider,
  type ExternalIdentity,
  type ExternalSession,
} from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { identityAccounts, users, workspaceMembers, workspaces } from "@/lib/db/schema";

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie");
  const match = cookie
    ?.split(";")
    .map((value) => value.trim().split("="))
    .find(([key]) => key === name);
  return match ? decodeURIComponent(match.slice(1).join("=")) : undefined;
}

function profileFromIdentities(identities: ExternalIdentity[]) {
  const google = identities.find((identity) => identity.provider === "privy_google");
  return { email: google?.email, displayName: google?.name };
}

export class AuthService {
  constructor(
    private readonly database: AppDatabase,
    private readonly provider: AuthProvider,
  ) {}

  private async synchronizeIdentity(session: ExternalSession) {
    const keys = session.identities.map(
      (identity) => `${identity.provider}\u0000${identity.subject}`,
    );
    const existing = await this.database
      .select()
      .from(identityAccounts)
      .where(
        inArray(
          identityAccounts.provider,
          session.identities.map((identity) => identity.provider),
        ),
      );
    const matches = existing.filter((account) =>
      keys.includes(`${account.provider}\u0000${account.providerSubject}`),
    );
    const matchedUserIds = new Set(matches.map((account) => account.userId));
    if (matchedUserIds.size > 1) {
      throw new IdentityConflictError("Linked identities belong to different internal users");
    }

    let userId = matches[0]?.userId;
    if (!userId) {
      const canonicalIdentity = session.identities.find(
        (identity) => identity.provider === "privy_user",
      );
      if (!canonicalIdentity) throw new IdentityConflictError("Privy user identity is missing");
      const newUserId = randomUUID();
      const workspaceId = randomUUID();
      const profile = profileFromIdentities(session.identities);
      try {
        await this.database.transaction(async (transaction) => {
          await transaction.insert(users).values({ id: newUserId, ...profile });
          await transaction.insert(workspaces).values({
            id: workspaceId,
            ownerId: newUserId,
            name: profile.displayName ? `${profile.displayName}'s Workspace` : "Personal Workspace",
          });
          await transaction
            .insert(workspaceMembers)
            .values({ workspaceId, userId: newUserId, role: "owner" });
          await transaction.insert(identityAccounts).values({
            id: randomUUID(),
            userId: newUserId,
            provider: canonicalIdentity.provider,
            providerSubject: canonicalIdentity.subject,
            metadata: {},
          });
        });
        userId = newUserId;
      } catch (error) {
        const [concurrentIdentity] = await this.database
          .select()
          .from(identityAccounts)
          .where(
            and(
              eq(identityAccounts.provider, canonicalIdentity.provider),
              eq(identityAccounts.providerSubject, canonicalIdentity.subject),
            ),
          )
          .limit(1);
        if (!concurrentIdentity) throw error;
        userId = concurrentIdentity.userId;
      }
    }

    await this.database.transaction(async (transaction) => {
      for (const identity of session.identities) {
        await transaction
          .insert(identityAccounts)
          .values({
            id: randomUUID(),
            userId,
            provider: identity.provider,
            providerSubject: identity.subject,
            walletAddress: identity.address,
            metadata: { email: identity.email, name: identity.name },
          })
          .onConflictDoUpdate({
            target: [identityAccounts.provider, identityAccounts.providerSubject],
            set: {
              walletAddress: identity.address,
              metadata: { email: identity.email, name: identity.name },
            },
          });
      }
      const userAccounts = await transaction
        .select()
        .from(identityAccounts)
        .where(eq(identityAccounts.userId, userId));
      const staleIds = userAccounts
        .filter(
          (account) =>
            (account.provider === "privy_google" || account.provider === "privy_wallet") &&
            !keys.includes(`${account.provider}\u0000${account.providerSubject}`),
        )
        .map((account) => account.id);
      if (staleIds.length > 0) {
        await transaction
          .delete(identityAccounts)
          .where(and(eq(identityAccounts.userId, userId), inArray(identityAccounts.id, staleIds)));
      }
    });
    return userId;
  }

  async resolve(request: Request): Promise<AuthContext> {
    const session = await this.provider.verifyWebSession(request);
    if (!session) throw new AuthenticationRequiredError("Authentication is required");
    const userId = await this.synchronizeIdentity(session);

    const requestedWorkspaceId = readCookie(request, "agent-cfo-workspace");
    const memberships = await this.database
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.joinedAt));
    if (memberships.length === 0) throw new WorkspaceAccessDeniedError("User has no workspace");

    const membership = requestedWorkspaceId
      ? memberships.find((item) => item.workspaceId === requestedWorkspaceId)
      : memberships[0];
    if (!membership) {
      throw new WorkspaceAccessDeniedError("Requested workspace is not available to this user");
    }

    return {
      userId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      identities: session.identities
        .filter(
          (
            identity,
          ): identity is ExternalIdentity & { provider: "privy_google" | "privy_wallet" } =>
            identity.provider !== "privy_user",
        )
        .map((identity) => ({
          type: identity.provider === "privy_google" ? "google" : "wallet",
          subject: identity.subject,
          address: identity.address,
        })),
    };
  }

  async requireRole(request: Request, roles: AuthContext["role"][]) {
    const context = await this.resolve(request);
    if (!roles.includes(context.role)) {
      throw new WorkspaceAccessDeniedError("The active role cannot perform this action");
    }
    return context;
  }
}
