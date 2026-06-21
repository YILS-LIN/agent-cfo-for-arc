import "server-only";

import { createHmac } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { rateLimitCounters } from "@/lib/db/schema";

export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests");
  }
}

export class RateLimitNotConfiguredError extends Error {}

export class RateLimitService {
  constructor(
    private readonly database: AppDatabase,
    private readonly hashKey: string,
  ) {
    if (hashKey.length < 32) {
      throw new RateLimitNotConfiguredError("RATE_LIMIT_HASH_KEY must be at least 32 characters");
    }
  }

  async consume(
    input: { scope: string; key: string; limit: number; windowMs: number },
    now = new Date(),
  ) {
    const windowStartMs = Math.floor(now.getTime() / input.windowMs) * input.windowMs;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + input.windowMs * 2);
    const keyHash = createHmac("sha256", this.hashKey)
      .update(`${input.scope}\u0000${input.key}`)
      .digest("hex");
    const [counter] = await this.database
      .insert(rateLimitCounters)
      .values({ scope: input.scope, keyHash, windowStart, expiresAt, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitCounters.scope, rateLimitCounters.keyHash, rateLimitCounters.windowStart],
        set: { count: sql`${rateLimitCounters.count} + 1`, expiresAt },
      })
      .returning({ count: rateLimitCounters.count });
    if (!counter) throw new Error("Rate limit counter returned no row");
    if (counter.count === 1) {
      await this.database.delete(rateLimitCounters).where(lt(rateLimitCounters.expiresAt, now));
    }
    if (counter.count > input.limit) {
      throw new RateLimitExceededError(
        Math.max(1, Math.ceil((windowStartMs + input.windowMs - now.getTime()) / 1_000)),
      );
    }
    return { remaining: Math.max(0, input.limit - counter.count), expiresAt };
  }
}

export function workspaceRateLimitKey(context: AuthContext) {
  return `${context.workspaceId}:${context.userId}`;
}

export function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwarded ??
    "unknown";
  return `${address}:${request.headers.get("user-agent") ?? "unknown"}`;
}
