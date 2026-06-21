import type { AuthContext } from "@/lib/auth/types";
import {
  IdempotencyKeyRequiredError,
  IdempotencyRequestUnresolvedError,
} from "@/lib/application/workspace-service";
import type { AppDatabase } from "@/lib/db/database";
import {
  AiCredentialRepository,
  AuditRepository,
  IdempotencyRepository,
  RepositoryNotFoundError,
} from "@/lib/db/repositories";
import { SecretVault } from "@/lib/secrets/vault";

export class AiCredentialPermissionError extends Error {}
export class AiCredentialNotConfiguredError extends Error {}

function idempotencyKey(value: string) {
  const key = value.trim();
  if (!key) throw new IdempotencyKeyRequiredError("Idempotency-Key is required");
  if (key.length > 255) {
    throw new IdempotencyKeyRequiredError("Idempotency-Key must not exceed 255 characters");
  }
  return key;
}

function safeCredential(credential: Awaited<ReturnType<AiCredentialRepository["getByProvider"]>>) {
  if (!credential) throw new RepositoryNotFoundError("Stored AI credential no longer exists");
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
}

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
    rawIdempotencyKey: string,
  ) {
    if (context.role === "viewer")
      throw new AiCredentialPermissionError("Viewer access is read-only");
    const key = idempotencyKey(rawIdempotencyKey);
    const idempotency = new IdempotencyRepository(this.database);
    const claim = await idempotency.claim(context, {
      operation: "ai_credential.store",
      key,
      request: input,
    });
    if (claim.state === "completed") {
      return safeCredential(await this.credentials.getByProvider(context, input.provider));
    }
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }
    const encrypted = this.vault.encrypt(input.secret, {
      workspaceId: context.workspaceId,
      provider: input.provider,
    });
    try {
      return await this.database.transaction(async (transaction) => {
        const credentials = new AiCredentialRepository(transaction);
        const audits = new AuditRepository(transaction);
        const transactionIdempotency = new IdempotencyRepository(transaction);
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
          idempotencyKey: key,
          payload: {
            provider: credential.provider,
            model: credential.model,
            version: credential.version,
          },
        });
        await transactionIdempotency.complete(context, {
          id: claim.record.id,
          response: { provider: credential.provider },
        });
        return safeCredential(credential);
      });
    } catch (error) {
      await idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
  }

  async delete(
    context: AuthContext,
    input: { provider: "openai"; expectedVersion: number },
    rawIdempotencyKey: string,
  ) {
    if (context.role === "viewer")
      throw new AiCredentialPermissionError("Viewer access is read-only");
    const key = idempotencyKey(rawIdempotencyKey);
    const idempotency = new IdempotencyRepository(this.database);
    const claim = await idempotency.claim(context, {
      operation: "ai_credential.delete",
      key,
      request: input,
    });
    if (claim.state === "completed") return { deleted: true } as const;
    if (claim.state !== "claimed") {
      throw new IdempotencyRequestUnresolvedError(
        "A request with this idempotency key is still unresolved",
      );
    }
    try {
      return await this.database.transaction(async (transaction) => {
        const credentials = new AiCredentialRepository(transaction);
        const audits = new AuditRepository(transaction);
        const transactionIdempotency = new IdempotencyRepository(transaction);
        const deleted = await credentials.delete(context, input);
        await audits.record(context, {
          actorUserId: context.userId,
          action: "ai_credential.deleted",
          entityType: "ai_credential",
          entityId: deleted.id,
          source: "web",
          idempotencyKey: key,
          payload: { provider: deleted.provider, version: deleted.version },
        });
        await transactionIdempotency.complete(context, {
          id: claim.record.id,
          response: { deleted: true },
        });
        return { deleted: true } as const;
      });
    } catch (error) {
      await idempotency.fail(context, {
        id: claim.record.id,
        errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      });
      throw error;
    }
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
