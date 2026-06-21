import "server-only";

import { getDatabase } from "@/lib/db/client";
import type { AuthContext } from "@/lib/auth/types";
import {
  RateLimitNotConfiguredError,
  RateLimitService,
  requestClientKey,
  workspaceRateLimitKey,
} from "@/lib/security/rate-limit";

let rateLimitService: RateLimitService | undefined;

export function getRateLimitService() {
  const hashKey = process.env.RATE_LIMIT_HASH_KEY;
  if (!hashKey) throw new RateLimitNotConfiguredError("RATE_LIMIT_HASH_KEY is required");
  rateLimitService ??= new RateLimitService(getDatabase(), hashKey);
  return rateLimitService;
}

export function enforceWorkspaceRateLimit(
  context: AuthContext,
  scope: string,
  options: { limit?: number; windowMs?: number } = {},
) {
  return getRateLimitService().consume({
    scope,
    key: workspaceRateLimitKey(context),
    limit: options.limit ?? 120,
    windowMs: options.windowMs ?? 60_000,
  });
}

export function enforceClientRateLimit(
  request: Request,
  scope: string,
  options: { limit?: number; windowMs?: number } = {},
) {
  return getRateLimitService().consume({
    scope,
    key: requestClientKey(request),
    limit: options.limit ?? 60,
    windowMs: options.windowMs ?? 60_000,
  });
}
