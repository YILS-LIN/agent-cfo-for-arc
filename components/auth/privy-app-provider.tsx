"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

import {
  AuthenticatedWorkspaceSessionProvider,
  PublicDemoSessionProvider,
} from "@/components/auth/workspace-session-provider";

export function PrivyAppProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <PublicDemoSessionProvider>{children}</PublicDemoSessionProvider>;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "wallet"],
        appearance: {
          theme: "light",
          accentColor: "#3465ff",
          landingHeader: "Sign in to Agent CFO",
        },
      }}
    >
      <AuthenticatedWorkspaceSessionProvider>{children}</AuthenticatedWorkspaceSessionProvider>
    </PrivyProvider>
  );
}
