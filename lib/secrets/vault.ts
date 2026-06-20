import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class SecretVaultNotConfiguredError extends Error {}
export class SecretDecryptionError extends Error {}

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
  hint: string;
};

function additionalData(scope: { workspaceId: string; provider: string }) {
  return Buffer.from(`${scope.workspaceId}\u0000${scope.provider}`, "utf8");
}

function secretHint(secret: string) {
  return `••••${secret.slice(-4)}`;
}

export class SecretVault {
  private readonly keys: Map<string, Buffer>;

  constructor(
    private readonly key: Buffer,
    private readonly keyId = "v1",
    previousKeys: Record<string, Buffer> = {},
  ) {
    if (key.length !== 32) {
      throw new SecretVaultNotConfiguredError("Secret encryption key must decode to 32 bytes");
    }
    this.keys = new Map([[keyId, key], ...Object.entries(previousKeys)]);
    if ([...this.keys.values()].some((candidate) => candidate.length !== 32)) {
      throw new SecretVaultNotConfiguredError(
        "Every secret encryption key must decode to 32 bytes",
      );
    }
  }

  static fromEnvironment() {
    const encodedKey = process.env.SECRETS_ENCRYPTION_KEY;
    if (!encodedKey) {
      throw new SecretVaultNotConfiguredError("SECRETS_ENCRYPTION_KEY is required");
    }
    const key = Buffer.from(encodedKey, "base64");
    if (key.toString("base64").replaceAll("=", "") !== encodedKey.replaceAll("=", "")) {
      throw new SecretVaultNotConfiguredError("SECRETS_ENCRYPTION_KEY must be valid base64");
    }
    let previousKeys: Record<string, Buffer> = {};
    if (process.env.SECRETS_ENCRYPTION_PREVIOUS_KEYS) {
      try {
        previousKeys = Object.fromEntries(
          Object.entries(
            JSON.parse(process.env.SECRETS_ENCRYPTION_PREVIOUS_KEYS) as Record<string, string>,
          ).map(([id, value]) => [id, Buffer.from(value, "base64")]),
        );
      } catch {
        throw new SecretVaultNotConfiguredError(
          "SECRETS_ENCRYPTION_PREVIOUS_KEYS must be a JSON object of base64 keys",
        );
      }
    }
    return new SecretVault(key, process.env.SECRETS_ENCRYPTION_KEY_ID ?? "v1", previousKeys);
  }

  encrypt(secret: string, scope: { workspaceId: string; provider: string }): EncryptedSecret {
    if (!secret.trim()) throw new Error("Secret cannot be empty");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(additionalData(scope));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyId: this.keyId,
      hint: secretHint(secret),
    };
  }

  decrypt(
    encrypted: Pick<EncryptedSecret, "ciphertext" | "iv" | "authTag" | "keyId">,
    scope: { workspaceId: string; provider: string },
  ) {
    try {
      const key = this.keys.get(encrypted.keyId);
      if (!key) throw new Error("Unknown encryption key");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
      decipher.setAAD(additionalData(scope));
      decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new SecretDecryptionError("Credential could not be authenticated or decrypted");
    }
  }
}
