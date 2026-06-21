import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { rateLimitCounters } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import {
  RateLimitExceededError,
  RateLimitNotConfiguredError,
  RateLimitService,
} from "@/lib/security/rate-limit";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("PostgreSQL rate limiter", () => {
  let testDatabase: TestDatabase;
  let service: RateLimitService;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
    service = new RateLimitService(
      testDatabase.database,
      "test-hash-key-with-at-least-32-characters",
    );
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  it("atomically enforces a fixed window and stores only a keyed hash", async () => {
    const now = new Date("2026-06-21T00:00:10.000Z");
    await service.consume(
      { scope: "report", key: "workspace:user", limit: 2, windowMs: 60_000 },
      now,
    );
    await service.consume(
      { scope: "report", key: "workspace:user", limit: 2, windowMs: 60_000 },
      now,
    );
    await expect(
      service.consume({ scope: "report", key: "workspace:user", limit: 2, windowMs: 60_000 }, now),
    ).rejects.toMatchObject({ retryAfterSeconds: 50 } satisfies Partial<RateLimitExceededError>);

    const [counter] = await testDatabase.database.select().from(rateLimitCounters);
    expect(counter).toMatchObject({ scope: "report", count: 3 });
    expect(JSON.stringify(counter)).not.toContain("workspace:user");
  });

  it("starts a fresh counter in the next window", async () => {
    const input = { scope: "sync", key: "workspace:user", limit: 1, windowMs: 60_000 };
    await service.consume(input, new Date("2026-06-21T00:00:59.000Z"));
    await expect(
      service.consume(input, new Date("2026-06-21T00:01:00.000Z")),
    ).resolves.toMatchObject({ remaining: 0 });
    await expect(testDatabase.database.select().from(rateLimitCounters)).resolves.toHaveLength(2);
  });

  it("preserves the limit under concurrent requests", async () => {
    const input = { scope: "mcp", key: "workspace:user", limit: 5, windowMs: 60_000 };
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.consume(input, new Date("2026-06-21T00:00:10.000Z")),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
    const [counter] = await testDatabase.database.select().from(rateLimitCounters);
    expect(counter.count).toBe(10);
  });

  it("requires a strong key for pseudonymizing identifiers", () => {
    expect(() => new RateLimitService(testDatabase.database, "short")).toThrow(
      RateLimitNotConfiguredError,
    );
  });
});
