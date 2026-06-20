import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase } from "@/lib/db/testing";
import {
  budgets,
  paymentEvents,
  users,
  wallets,
  workspaceMembers,
  workspaces,
  type WalletCapabilities,
} from "@/lib/db/schema";

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

const capabilities: WalletCapabilities = {
  observable: true,
  ownershipVerified: false,
  userSignable: false,
  agentExecutable: false,
  policyEnforceable: false,
};

describe("PostgreSQL persistence schema", () => {
  let testDatabase: TestDatabase;

  beforeEach(async () => {
    testDatabase = await createTestDatabase();
  });

  afterEach(async () => {
    await testDatabase?.close();
  });

  async function createWorkspace(name: string) {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    await testDatabase.database
      .insert(users)
      .values({ id: userId, email: `${userId}@example.com` });
    await testDatabase.database
      .insert(workspaces)
      .values({ id: workspaceId, name, ownerId: userId });
    await testDatabase.database
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role: "owner" });
    return { userId, workspaceId };
  }

  it("applies the baseline migration and enforces tenant wallet uniqueness", async () => {
    const first = await createWorkspace("First");
    const second = await createWorkspace("Second");
    const address = "0x1111111111111111111111111111111111111111";

    await testDatabase.database.insert(wallets).values({
      id: randomUUID(),
      workspaceId: first.workspaceId,
      address,
      normalizedAddress: address,
      chainId: 5_042_002,
      source: "manual",
      label: "Primary",
      capabilities,
    });

    await expect(
      testDatabase.database.insert(wallets).values({
        id: randomUUID(),
        workspaceId: first.workspaceId,
        address,
        normalizedAddress: address,
        chainId: 5_042_002,
        source: "manual",
        label: "Duplicate",
        capabilities,
      }),
    ).rejects.toThrow();

    await expect(
      testDatabase.database.insert(wallets).values({
        id: randomUUID(),
        workspaceId: second.workspaceId,
        address,
        normalizedAddress: address,
        chainId: 5_042_002,
        source: "manual",
        label: "Same public wallet in another workspace",
        capabilities,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects non-normalized addresses and invalid financial facts", async () => {
    const { workspaceId } = await createWorkspace("Finance constraints");
    const mixedCaseAddress = "0xABCDEF0000000000000000000000000000000000";

    await expect(
      testDatabase.database.insert(wallets).values({
        id: randomUUID(),
        workspaceId,
        address: mixedCaseAddress,
        normalizedAddress: mixedCaseAddress,
        chainId: 5_042_002,
        source: "manual",
        label: "Invalid normalization",
        capabilities,
      }),
    ).rejects.toThrow();

    const walletId = randomUUID();
    const normalizedAddress = mixedCaseAddress.toLowerCase();
    await testDatabase.database.insert(wallets).values({
      id: walletId,
      workspaceId,
      address: mixedCaseAddress,
      normalizedAddress,
      chainId: 5_042_002,
      source: "manual",
      label: "Valid",
      capabilities,
    });

    await expect(
      testDatabase.database.insert(paymentEvents).values({
        id: randomUUID(),
        workspaceId,
        walletId,
        externalId: "invalid-negative-payment",
        amount: "-0.000001",
        occurredAt: new Date(),
        source: "arc",
      }),
    ).rejects.toThrow();

    await expect(
      testDatabase.database.insert(budgets).values({
        id: randomUUID(),
        workspaceId,
        periodType: "daily",
        periodStart: new Date("2026-06-21T00:00:00.000Z"),
        periodEnd: new Date("2026-06-20T00:00:00.000Z"),
        amount: "1",
        warningThreshold: "101",
      }),
    ).rejects.toThrow();
  });

  it("preserves six-decimal USDC facts and deduplicates source events", async () => {
    const { workspaceId } = await createWorkspace("Payment facts");
    const walletId = randomUUID();
    const address = "0x2222222222222222222222222222222222222222";
    await testDatabase.database.insert(wallets).values({
      id: walletId,
      workspaceId,
      address,
      normalizedAddress: address,
      chainId: 5_042_002,
      source: "external",
      label: "Evidence",
      capabilities,
    });

    const payment = {
      id: randomUUID(),
      workspaceId,
      walletId,
      externalId: "settlement-1",
      amount: "0.000001",
      occurredAt: new Date("2026-06-20T00:00:00.000Z"),
      source: "circle_gateway" as const,
    };
    await testDatabase.database.insert(paymentEvents).values(payment);

    const rows = await testDatabase.database.select().from(paymentEvents);
    expect(rows[0]?.amount).toBe("0.000001");

    await expect(
      testDatabase.database
        .insert(paymentEvents)
        .values({ ...payment, id: randomUUID(), amount: "0.000002" }),
    ).rejects.toThrow();
  });

  it("rejects cross-workspace relationships at the database boundary", async () => {
    const first = await createWorkspace("Tenant A");
    const second = await createWorkspace("Tenant B");
    const secondWalletId = randomUUID();
    const address = "0x3333333333333333333333333333333333333333";
    await testDatabase.database.insert(wallets).values({
      id: secondWalletId,
      workspaceId: second.workspaceId,
      address,
      normalizedAddress: address,
      chainId: 5_042_002,
      source: "manual",
      label: "Tenant B wallet",
      capabilities,
    });

    await expect(
      testDatabase.database.insert(paymentEvents).values({
        id: randomUUID(),
        workspaceId: first.workspaceId,
        walletId: secondWalletId,
        externalId: "cross-tenant-payment",
        amount: "0.01",
        occurredAt: new Date(),
        source: "arc",
      }),
    ).rejects.toThrow();
  });
});
