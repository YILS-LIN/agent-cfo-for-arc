import type { AuthContext } from "@/lib/auth/types";
import type { AppDatabase } from "@/lib/db/database";
import { AiCredentialRepository, AuditRepository } from "@/lib/db/repositories";
import { SecretVault } from "@/lib/secrets/vault";

export class AiCredentialPermissionError extends Error {}
export class AiCredentialNotConfiguredError extends Error {}

export class AiCredentialService {
  private readonly credentials: AiCredentialRepository;

  constructor(
    private readonly database: AppDatabase,
    private readonly vault: SecretVault,
  ) {
    this.credentials = new AiCredentialRepository(database);
  }

  list(context: AuthContext) {
    return this.credentials.listSafe(context);
  }

  async store(
    context: AuthContext,
    input: {
      provider: "openai";
      model: string;
      secret: string;
      expectedVersion: number;
    },
  ) {
    if (context.role === "viewer")
      throw new AiCredentialPermissionError("Viewer access is read-only");
    const encrypted = this.vault.encrypt(input.secret, {
      workspaceId: context.workspaceId,
      provider: input.provider,
    });
    return this.database.transaction(async (transaction) => {
      const credentials = new AiCredentialRepository(transaction);
      const audits = new AuditRepository(transaction);
      const credential = await credentials.store(context, {
        provider: input.provider,
        model: input.model,
        encryptedSecret: encrypted.ciphertext,
        encryptionIv: encrypted.iv,
        encryptionAuthTag: encrypted.authTag,
        encryptionKeyId: encrypted.keyId,
        secretHint: encrypted.hint,
        expectedVersion: input.expectedVersion,
        actorUserId: context.userId,
      });
      await audits.record(context, {
        actorUserId: context.userId,
        action: "ai_credential.stored",
        entityType: "ai_credential",
        entityId: credential.id,
        source: "web",
        payload: {
          provider: credential.provider,
          model: credential.model,
          version: credential.version,
        },
      });
      return {
        id: credential.id,
        provider: credential.provider,
        model: credential.model,
        secretHint: credential.secretHint,
        status: credential.status,
        version: credential.version,
        lastVerifiedAt: credential.lastVerifiedAt,
        lastErrorCode: credential.lastErrorCode,
        updatedAt: credential.updatedAt,
      };
    });
  }

  async delete(context: AuthContext, input: { provider: "openai"; expectedVersion: number }) {
    if (context.role === "viewer")
      throw new AiCredentialPermissionError("Viewer access is read-only");
    return this.database.transaction(async (transaction) => {
      const credentials = new AiCredentialRepository(transaction);
      const audits = new AuditRepository(transaction);
      const deleted = await credentials.delete(context, input);
      await audits.record(context, {
        actorUserId: context.userId,
        action: "ai_credential.deleted",
        entityType: "ai_credential",
        entityId: deleted.id,
        source: "web",
        payload: { provider: deleted.provider, version: deleted.version },
      });
      return { deleted: true } as const;
    });
  }

  async getDecrypted(context: AuthContext, provider: "openai") {
    const credential = await this.credentials.getByProvider(context, provider);
    if (!credential)
      throw new AiCredentialNotConfiguredError(`${provider} credential is not configured`);
    const secret = this.vault.decrypt(
      {
        ciphertext: credential.encryptedSecret,
        iv: credential.encryptionIv,
        authTag: credential.encryptionAuthTag,
        keyId: credential.encryptionKeyId,
      },
      { workspaceId: context.workspaceId, provider },
    );
    return { credential, secret };
  }

  markStatus(
    context: AuthContext,
    input: { provider: "openai"; status: "valid" | "invalid"; errorCode?: string },
  ) {
    return this.credentials.markStatus(context, input);
  }
}
