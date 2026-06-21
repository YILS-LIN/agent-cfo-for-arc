import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  AnalysisLimitExceededError,
  ApplicationPermissionError,
  IdempotencyKeyRequiredError,
  IdempotencyRequestUnresolvedError,
} from "@/lib/application/workspace-service";
import {
  AiCredentialNotConfiguredError,
  AiCredentialPermissionError,
} from "@/lib/ai/credential-service";
import { authErrorResponse } from "@/lib/auth/server";
import {
  InternalAuthenticationNotConfiguredError,
  InternalAuthenticationRequiredError,
} from "@/lib/auth/internal";
import {
  IdempotencyConflictError,
  OptimisticLockError,
  PaymentReplayConflictError,
  RepositoryNotFoundError,
  SyncLeaseUnavailableError,
} from "@/lib/db/repositories";
import { SyncSourceUnavailableError } from "@/lib/sync/circle-public-adapter";
import { SyncAdapterNotConfiguredError, SyncPermissionError } from "@/lib/sync/service";
import { SecretDecryptionError, SecretVaultNotConfiguredError } from "@/lib/secrets/vault";
import { AiProviderResponseError } from "@/lib/ai/report-generator";
import { ReportContentError, ReportNotReadyError } from "@/lib/reports/service";
import {
  CrossSiteRequestError,
  RequestBodyTooLargeError,
  UnsupportedMediaTypeError,
} from "@/lib/application/request-security";

export function apiErrorResponse(error: unknown) {
  if (error instanceof InternalAuthenticationRequiredError) {
    return NextResponse.json(
      { error: error.message, code: "INTERNAL_AUTHENTICATION_REQUIRED" },
      { status: 401 },
    );
  }
  if (error instanceof InternalAuthenticationNotConfiguredError) {
    return NextResponse.json(
      { error: error.message, code: "INTERNAL_AUTHENTICATION_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  const authResponse = authErrorResponse(error);
  if (authResponse) return authResponse;

  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request payload", code: "INVALID_REQUEST", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Request body must be valid JSON", code: "INVALID_JSON" },
      { status: 400 },
    );
  }
  if (error instanceof RequestBodyTooLargeError) {
    return NextResponse.json(
      { error: error.message, code: "REQUEST_BODY_TOO_LARGE" },
      { status: 413 },
    );
  }
  if (error instanceof UnsupportedMediaTypeError) {
    return NextResponse.json(
      { error: error.message, code: "UNSUPPORTED_MEDIA_TYPE" },
      { status: 415 },
    );
  }
  if (error instanceof CrossSiteRequestError) {
    return NextResponse.json({ error: error.message, code: "CROSS_SITE_REQUEST" }, { status: 403 });
  }
  if (error instanceof IdempotencyKeyRequiredError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }
  if (error instanceof ApplicationPermissionError) {
    return NextResponse.json({ error: error.message, code: "ROLE_FORBIDDEN" }, { status: 403 });
  }
  if (error instanceof AiCredentialPermissionError) {
    return NextResponse.json({ error: error.message, code: "ROLE_FORBIDDEN" }, { status: 403 });
  }
  if (error instanceof AiCredentialNotConfiguredError) {
    return NextResponse.json(
      { error: error.message, code: "AI_CREDENTIAL_NOT_CONFIGURED" },
      { status: 422 },
    );
  }
  if (error instanceof AiProviderResponseError) {
    const status = error.code === "rate_limit" ? 429 : error.code === "unavailable" ? 502 : 422;
    return NextResponse.json(
      { error: error.message, code: `AI_${error.code.toUpperCase()}` },
      { status, headers: error.code === "rate_limit" ? { "Retry-After": "30" } : undefined },
    );
  }
  if (error instanceof ReportContentError) {
    return NextResponse.json(
      { error: error.message, code: "REPORT_CONTENT_INVALID" },
      { status: 500 },
    );
  }
  if (error instanceof ReportNotReadyError) {
    return NextResponse.json(
      { error: error.message, code: "REPORT_NOT_READY" },
      { status: 409, headers: { "Retry-After": "2" } },
    );
  }
  if (error instanceof SecretVaultNotConfiguredError) {
    return NextResponse.json(
      { error: error.message, code: "SECRET_VAULT_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  if (error instanceof SecretDecryptionError) {
    return NextResponse.json(
      { error: "Stored credential cannot be decrypted", code: "SECRET_DECRYPTION_FAILED" },
      { status: 500 },
    );
  }
  if (error instanceof AnalysisLimitExceededError) {
    return NextResponse.json(
      { error: error.message, code: "ANALYSIS_LIMIT_EXCEEDED" },
      { status: 422 },
    );
  }
  if (error instanceof IdempotencyConflictError) {
    return NextResponse.json(
      { error: error.message, code: "IDEMPOTENCY_CONFLICT" },
      { status: 409 },
    );
  }
  if (error instanceof PaymentReplayConflictError) {
    return NextResponse.json(
      { error: error.message, code: "PAYMENT_REPLAY_CONFLICT" },
      { status: 409 },
    );
  }
  if (error instanceof IdempotencyRequestUnresolvedError) {
    return NextResponse.json(
      { error: error.message, code: "IDEMPOTENCY_REQUEST_UNRESOLVED" },
      { status: 409, headers: { "Retry-After": "2" } },
    );
  }
  if (error instanceof OptimisticLockError) {
    return NextResponse.json(
      { error: error.message, code: "OPTIMISTIC_LOCK_CONFLICT" },
      { status: 409 },
    );
  }
  if (error instanceof RepositoryNotFoundError) {
    return NextResponse.json({ error: error.message, code: "NOT_FOUND" }, { status: 404 });
  }
  if (error instanceof SyncPermissionError) {
    return NextResponse.json({ error: error.message, code: "ROLE_FORBIDDEN" }, { status: 403 });
  }
  if (error instanceof SyncLeaseUnavailableError) {
    return NextResponse.json(
      { error: error.message, code: "SYNC_ALREADY_RUNNING" },
      { status: 409, headers: { "Retry-After": "5" } },
    );
  }
  if (
    error instanceof SyncSourceUnavailableError ||
    error instanceof SyncAdapterNotConfiguredError
  ) {
    return NextResponse.json(
      { error: error.message, code: "SYNC_SOURCE_UNAVAILABLE" },
      { status: 422 },
    );
  }
  if (hasDatabaseErrorCode(error, "23505")) {
    return NextResponse.json(
      { error: "A matching resource already exists", code: "RESOURCE_CONFLICT" },
      { status: 409 },
    );
  }

  const requestId = randomUUID();
  console.error("Unhandled API error", { requestId, error });
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL_ERROR", requestId },
    { status: 500 },
  );
}

function hasDatabaseErrorCode(error: unknown, expectedCode: string): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ("code" in current && current.code === expectedCode) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
