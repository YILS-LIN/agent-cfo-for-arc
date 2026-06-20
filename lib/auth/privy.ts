import "server-only";

import {
  PrivyClient,
  verifyAccessToken,
  verifyIdentityToken,
  type LinkedAccount,
  type User,
} from "@privy-io/node";

import type { AuthProvider, ExternalIdentity, ExternalSession } from "@/lib/auth/types";

type PrivyAuthDependencies = {
  verifyAccessToken: typeof verifyAccessToken;
  verifyIdentityToken: typeof verifyIdentityToken;
  loadUser: (userId: string) => Promise<User>;
};

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie");
  if (!cookies) return undefined;
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

function readAccessToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice(7).trim();
  return readCookie(request, "privy-token");
}

function mapLinkedAccount(account: LinkedAccount): ExternalIdentity | null {
  if (account.type === "google_oauth") {
    return {
      provider: "privy_google",
      subject: account.subject,
      email: account.email,
      name: account.name ?? undefined,
    };
  }
  if (account.type === "wallet" && account.chain_type === "ethereum") {
    return {
      provider: "privy_wallet",
      subject: account.address.toLowerCase(),
      address: account.address.toLowerCase() as `0x${string}`,
    };
  }
  return null;
}

export class PrivyAuthProvider implements AuthProvider {
  constructor(
    private readonly config: {
      appId: string;
      verificationKey: string;
    },
    private readonly dependencies: PrivyAuthDependencies,
  ) {}

  static fromEnvironment() {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    const verificationKey = process.env.PRIVY_VERIFICATION_KEY;
    if (!appId || !appSecret || !verificationKey) {
      throw new Error(
        "NEXT_PUBLIC_PRIVY_APP_ID, PRIVY_APP_SECRET and PRIVY_VERIFICATION_KEY are required",
      );
    }
    const client = new PrivyClient({ appId, appSecret, jwtVerificationKey: verificationKey });
    return new PrivyAuthProvider(
      { appId, verificationKey },
      {
        verifyAccessToken,
        verifyIdentityToken,
        loadUser: (userId) => client.users()._get(userId),
      },
    );
  }

  async verifyWebSession(request: Request): Promise<ExternalSession | null> {
    const accessToken = readAccessToken(request);
    if (!accessToken) return null;

    const access = await this.dependencies.verifyAccessToken({
      access_token: accessToken,
      app_id: this.config.appId,
      verification_key: this.config.verificationKey,
    });
    const identityToken = readCookie(request, "privy-id-token");
    const user = identityToken
      ? await this.dependencies.verifyIdentityToken({
          identity_token: identityToken,
          app_id: this.config.appId,
          verification_key: this.config.verificationKey,
        })
      : await this.dependencies.loadUser(access.user_id);

    if (user.id !== access.user_id)
      throw new Error("Privy access and identity tokens do not match");

    const identities = user.linked_accounts
      .map(mapLinkedAccount)
      .filter((identity): identity is ExternalIdentity => identity !== null);
    identities.unshift({ provider: "privy_user", subject: user.id });

    return {
      providerUserId: user.id,
      sessionId: access.session_id,
      identities,
    };
  }
}
