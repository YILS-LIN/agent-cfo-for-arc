import "server-only";

import { NextResponse } from "next/server";

import { PrivyAuthProvider } from "@/lib/auth/privy";
import { AuthService } from "@/lib/auth/service";
import {
  AuthenticationNotConfiguredError,
  AuthenticationRequiredError,
  WorkspaceAccessDeniedError,
} from "@/lib/auth/types";
import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";

let authService: AuthService | undefined;

export function isAuthenticationConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID &&
    process.env.PRIVY_APP_SECRET &&
    process.env.PRIVY_VERIFICATION_KEY &&
    isDatabaseConfigured(),
  );
}

export function getAuthService() {
  if (authService) return authService;
  if (!isAuthenticationConfigured()) {
    throw new AuthenticationNotConfiguredError(
      "Authentication and database environment variables are not fully configured",
    );
  }
  authService = new AuthService(getDatabase(), PrivyAuthProvider.fromEnvironment());
  return authService;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return NextResponse.json(
      { error: error.message, code: "AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  if (error instanceof AuthenticationNotConfiguredError) {
    return NextResponse.json(
      { error: "Authentication is not configured", code: "AUTHENTICATION_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (error instanceof WorkspaceAccessDeniedError) {
    return NextResponse.json(
      { error: error.message, code: "WORKSPACE_ACCESS_DENIED" },
      { status: 403 },
    );
  }
  return null;
}
