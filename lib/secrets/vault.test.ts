import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SecretDecryptionError, SecretVault } from "@/lib/secrets/vault";

describe("SecretVault", () => {
  it("round-trips a credential without exposing it in metadata", () => {
    const vault = new SecretVault(randomBytes(32), "test-key");
    const scope = { workspaceId: "workspace-1", provider: "openai" };
    const encrypted = vault.encrypt("sk-secret-value-1234", scope);

    expect(encrypted).toMatchObject({ keyId: "test-key", hint: "••••1234" });
    expect(JSON.stringify(encrypted)).not.toContain("sk-secret-value");
    expect(vault.decrypt(encrypted, scope)).toBe("sk-secret-value-1234");
  });

  it("rejects ciphertext moved to another tenant or provider", () => {
    const vault = new SecretVault(randomBytes(32));
    const encrypted = vault.encrypt("sk-secret", {
      workspaceId: "workspace-1",
      provider: "openai",
    });

    expect(() =>
      vault.decrypt(encrypted, { workspaceId: "workspace-2", provider: "openai" }),
    ).toThrow(SecretDecryptionError);
    expect(() =>
      vault.decrypt(encrypted, { workspaceId: "workspace-1", provider: "anthropic" }),
    ).toThrow(SecretDecryptionError);
  });

  it("rejects tampered authentication tags", () => {
    const vault = new SecretVault(randomBytes(32));
    const scope = { workspaceId: "workspace-1", provider: "openai" };
    const encrypted = vault.encrypt("sk-secret", scope);
    const tampered = { ...encrypted, authTag: randomBytes(16).toString("base64") };

    expect(() => vault.decrypt(tampered, scope)).toThrow(SecretDecryptionError);
  });

  it("decrypts credentials created by a retained rotation key", () => {
    const oldKey = randomBytes(32);
    const oldVault = new SecretVault(oldKey, "v0");
    const scope = { workspaceId: "workspace-1", provider: "openai" };
    const encrypted = oldVault.encrypt("sk-old-secret", scope);
    const rotatedVault = new SecretVault(randomBytes(32), "v1", { v0: oldKey });

    expect(rotatedVault.decrypt(encrypted, scope)).toBe("sk-old-secret");
  });
});
