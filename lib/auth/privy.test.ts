import { describe, expect, it, vi } from "vitest";
import type { User } from "@privy-io/node";

import { PrivyAuthProvider } from "@/lib/auth/privy";

function makeUser(id = "did:privy:user-1"): User {
  return {
    id,
    created_at: 1,
    has_accepted_terms: true,
    is_guest: false,
    mfa_methods: [],
    linked_accounts: [
      {
        type: "google_oauth",
        subject: "google-subject",
        email: "owner@example.com",
        name: "Owner",
        first_verified_at: 1,
        latest_verified_at: 1,
        verified_at: 1,
      },
      {
        type: "wallet",
        address: "0xABCDEF0000000000000000000000000000000000",
        chain_type: "ethereum",
        first_verified_at: 1,
        latest_verified_at: 1,
        verified_at: 1,
        wallet_client: "unknown",
      },
    ],
  };
}

describe("Privy auth adapter", () => {
  it("returns null when a request has no access token", async () => {
    const verify = vi.fn();
    const provider = new PrivyAuthProvider(
      { appId: "app-id", verificationKey: "public-key" },
      {
        verifyAccessToken: verify,
        verifyIdentityToken: vi.fn(),
        loadUser: vi.fn(),
      },
    );

    await expect(provider.verifyWebSession(new Request("https://example.com"))).resolves.toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });

  it("verifies access and identity tokens and normalizes linked identities", async () => {
    const verifyAccess = vi.fn().mockResolvedValue({
      app_id: "app-id",
      issuer: "privy.io",
      issued_at: 1,
      expiration: 2,
      session_id: "session-1",
      user_id: "did:privy:user-1",
    });
    const verifyIdentity = vi.fn().mockResolvedValue(makeUser());
    const provider = new PrivyAuthProvider(
      { appId: "app-id", verificationKey: "public-key" },
      {
        verifyAccessToken: verifyAccess,
        verifyIdentityToken: verifyIdentity,
        loadUser: vi.fn(),
      },
    );
    const request = new Request("https://example.com", {
      headers: {
        authorization: "Bearer access-token",
        cookie: "privy-id-token=identity-token",
      },
    });

    const session = await provider.verifyWebSession(request);

    expect(session).toMatchObject({
      providerUserId: "did:privy:user-1",
      sessionId: "session-1",
      identities: [
        { provider: "privy_user", subject: "did:privy:user-1" },
        { provider: "privy_google", subject: "google-subject", email: "owner@example.com" },
        {
          provider: "privy_wallet",
          subject: "0xabcdef0000000000000000000000000000000000",
          address: "0xabcdef0000000000000000000000000000000000",
        },
      ],
    });
    expect(verifyAccess).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: "access-token", app_id: "app-id" }),
    );
    expect(verifyIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ identity_token: "identity-token", app_id: "app-id" }),
    );
  });

  it("loads the user server-side when the identity cookie is unavailable", async () => {
    const loadUser = vi.fn().mockResolvedValue(makeUser());
    const provider = new PrivyAuthProvider(
      { appId: "app-id", verificationKey: "public-key" },
      {
        verifyAccessToken: vi.fn().mockResolvedValue({
          app_id: "app-id",
          issuer: "privy.io",
          issued_at: 1,
          expiration: 2,
          session_id: "session-1",
          user_id: "did:privy:user-1",
        }),
        verifyIdentityToken: vi.fn(),
        loadUser,
      },
    );

    await provider.verifyWebSession(
      new Request("https://example.com", { headers: { cookie: "privy-token=access-token" } }),
    );
    expect(loadUser).toHaveBeenCalledWith("did:privy:user-1");
  });

  it("rejects mismatched access and identity tokens", async () => {
    const provider = new PrivyAuthProvider(
      { appId: "app-id", verificationKey: "public-key" },
      {
        verifyAccessToken: vi.fn().mockResolvedValue({
          app_id: "app-id",
          issuer: "privy.io",
          issued_at: 1,
          expiration: 2,
          session_id: "session-1",
          user_id: "did:privy:user-1",
        }),
        verifyIdentityToken: vi.fn().mockResolvedValue(makeUser("did:privy:someone-else")),
        loadUser: vi.fn(),
      },
    );

    await expect(
      provider.verifyWebSession(
        new Request("https://example.com", {
          headers: { authorization: "Bearer token", cookie: "privy-id-token=identity" },
        }),
      ),
    ).rejects.toThrow("do not match");
  });
});
