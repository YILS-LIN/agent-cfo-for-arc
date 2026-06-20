"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import type { ReactNode } from "react";

export function PrivyAppProvider({ children }: { children: ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return children;

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
      {children}
    </PrivyProvider>
  );
}
