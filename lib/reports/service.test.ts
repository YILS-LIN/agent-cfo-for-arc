import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiCredentialService } from "@/lib/ai/credential-service";
import type { WorkspaceApplicationService } from "@/lib/application/workspace-service";
import { ApplicationPermissionError } from "@/lib/application/workspace-service";
import { buildAgentSpendSummary } from "@/lib/analytics/agent-summary";
import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { IdempotencyConflictError, WorkspaceRepository } from "@/lib/db/repositories";
import { auditEvents, idempotencyKeys, reports } from "@/lib/db/schema";
import { createTestDatabase } from "@/lib/db/testing";
import { ReportService } from "@/lib/reports/service";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

describe("ReportService", () => {
  let testDatabase: TestDatabase;
  let database: AppDatabase;
  let owner: AuthContext;
  const summary = buildAgentSpendSummary();
  const workspaceService = {
    getWorkspaceDashboard: vi.fn(async () => summary),
  } as unknown as WorkspaceApplicationService;
  const credentials = {
    getDecrypted: vi.fn(async () => ({
      secret: "sk-test",
      credential: { model: "gpt-test" },
    })),
    markStatus: vi.fn(async () => undefined),
  } as unknown as AiCredentialService;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDatabase = await createTestDatabase();
    database = testDatabase.database;
    const scope = await new WorkspaceRepository(database).createPersonalWorkspace({
      displayName: "Alice",
      email: `${randomUUID()}@example.com`,
    });
    owner = { ...scope, role: "owner", identities: [] };
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  const input = {
    provider: "local" as const,
    rangeStart: new Date("2026-05-01T00:00:00.000Z"),
    rangeEnd: new Date("2026-06-01T00:00:00.000Z"),
  };

  it("persists, audits, and idempotently replays a deterministic report", async () => {
    const service = new ReportService(database, workspaceService, credentials);
    const first = await service.generate(owner, input, "report-1");
    const replay = await service.generate(owner, input, "report-1");

    expect(first.replayed).toBe(false);
    expect(first.report).toMatchObject({ status: "completed", provider: "local" });
    expect(replay).toMatchObject({ replayed: true, report: { id: first.report.id } });
    await expect(database.select().from(reports)).resolves.toHaveLength(1);
    await expect(database.select().from(auditEvents)).resolves.toHaveLength(2);
    await expect(database.select().from(idempotencyKeys)).resolves.toMatchObject([
      { status: "completed", response: { reportId: first.report.id } },
    ]);
  });

  it("uses the workspace BYOK credential without persisting the plaintext secret", async () => {
    const generate = vi.fn(async () => ({
      content: {
        headline: "Validated",
        executiveSummary: "Validated persisted facts.",
        findings: [],
        recommendations: [],
        caveats: [],
      },
      responseId: "resp_1",
    }));
    const factory = vi.fn(() => ({ generate }));
    const service = new ReportService(database, workspaceService, credentials, factory);

    await service.generate(owner, { ...input, provider: "openai" }, "report-openai");

    expect(factory).toHaveBeenCalledWith("sk-test", "gpt-test");
    expect(credentials.markStatus).toHaveBeenCalledWith(owner, {
      provider: "openai",
      status: "valid",
    });
    expect(JSON.stringify(await database.select().from(reports))).not.toContain("sk-test");
    expect(JSON.stringify(await database.select().from(auditEvents))).not.toContain("sk-test");
  });

  it("keeps viewer access read-only", async () => {
    const service = new ReportService(database, workspaceService, credentials);
    await expect(
      service.generate({ ...owner, role: "viewer" }, input, "viewer-report"),
    ).rejects.toBeInstanceOf(ApplicationPermissionError);
    await expect(database.select().from(reports)).resolves.toHaveLength(0);
  });

  it("does not replay a key when the requested date range changes", async () => {
    const service = new ReportService(database, workspaceService, credentials);
    await service.generate(owner, input, "range-sensitive");

    await expect(
      service.generate(
        owner,
        { ...input, rangeStart: new Date("2026-04-01T00:00:00.000Z") },
        "range-sensitive",
      ),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});
