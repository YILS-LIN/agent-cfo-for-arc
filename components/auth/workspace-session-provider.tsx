"use client";

import { usePrivy } from "@privy-io/react-auth";
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

  useEffect(() => {
    if (!ready || !authenticated) return;
    let cancelled = false;
    void apiFetch("/api/auth/session")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to initialize the workspace session");
        const context = (await response.json()) as SessionContext;
        if (!cancelled) {
          setSession(context);
          setSessionError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSession(null);
          setSessionError(error instanceof Error ? error.message : "Session initialization failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetch, authenticated, ready]);

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
      apiFetch,
    }),
    [apiFetch, authenticated, login, logout, ready, session, sessionError, user],
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
