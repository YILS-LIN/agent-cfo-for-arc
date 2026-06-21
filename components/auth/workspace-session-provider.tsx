"use client";

import { useLinkAccount, usePrivy, useUnlinkOAuth, useUnlinkWallet } from "@privy-io/react-auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SessionContext = {
  userId: string;
  workspaceId: string;
  role: "owner" | "operator" | "viewer";
  identities: Array<{
    type: "google" | "wallet";
    subject: string;
    address?: `0x${string}`;
  }>;
};

type WorkspaceSession = {
  mode: "demo" | "persistent";
  ready: boolean;
  authenticated: boolean;
  displayName?: string;
  session: SessionContext | null;
  sessionError: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
  linkIdentity: (type: "google" | "wallet") => void;
  unlinkIdentity: (identity: SessionContext["identities"][number]) => Promise<void>;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

export function PublicDemoSessionProvider({ children }: { children: ReactNode }) {
  const value = useMemo<WorkspaceSession>(
    () => ({
      mode: "demo",
      ready: true,
      authenticated: false,
      session: null,
      sessionError: null,
      signIn: () => undefined,
      signOut: async () => undefined,
      linkIdentity: () => undefined,
      unlinkIdentity: async () => undefined,
      apiFetch: async () => {
        throw new Error("Persistent workspace access is not configured");
      },
    }),
    [],
  );
  return (
    <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>
  );
}

export function AuthenticatedWorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const [session, setSession] = useState<SessionContext | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getAccessToken();
      if (!token) throw new Error("Your sign-in session has expired");
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "include", cache: "no-store" });
    },
    [getAccessToken],
  );

  const refreshSession = useCallback(
    async (signal?: AbortSignal) => {
      const response = await apiFetch("/api/auth/session", { signal });
      if (!response.ok) throw new Error("Unable to initialize the workspace session");
      const context = (await response.json()) as SessionContext;
      signal?.throwIfAborted();
      setSession(context);
      setSessionError(null);
    },
    [apiFetch],
  );
  const { linkGoogle, linkWallet } = useLinkAccount({
    onSuccess: () => void refreshSession(),
  });
  const { unlink: unlinkOAuth } = useUnlinkOAuth();
  const { unlink: unlinkWallet } = useUnlinkWallet();

  useEffect(() => {
    if (!ready || !authenticated) return;
    const controller = new AbortController();
    void Promise.resolve()
      .then(() => refreshSession(controller.signal))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSession(null);
        setSessionError(error instanceof Error ? error.message : "Session initialization failed");
      });
    return () => controller.abort();
  }, [authenticated, ready, refreshSession]);

  const value = useMemo<WorkspaceSession>(
    () => ({
      mode: "persistent",
      ready,
      authenticated,
      displayName: user?.google?.name || user?.email?.address || undefined,
      session: authenticated ? session : null,
      sessionError: authenticated ? sessionError : null,
      signIn: () => login(),
      signOut: async () => {
        await logout();
        setSession(null);
      },
      linkIdentity: (type) => {
        if (type === "google") linkGoogle();
        else linkWallet({ walletChainType: "ethereum-only" });
      },
      unlinkIdentity: async (identity) => {
        if (identity.type === "google") {
          await unlinkOAuth({ provider: "google", subject: identity.subject });
        } else {
          await unlinkWallet({ address: identity.address ?? identity.subject });
        }
        await refreshSession();
      },
      apiFetch,
    }),
    [
      apiFetch,
      authenticated,
      linkGoogle,
      linkWallet,
      login,
      logout,
      ready,
      refreshSession,
      session,
      sessionError,
      unlinkOAuth,
      unlinkWallet,
      user,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value)
    throw new Error("useWorkspaceSession must be used within a workspace session provider");
  return value;
}
