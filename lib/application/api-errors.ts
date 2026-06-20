import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ApplicationPermissionError,
  IdempotencyKeyRequiredError,
  IdempotencyRequestUnresolvedError,
} from "@/lib/application/workspace-service";
import { authErrorResponse } from "@/lib/auth/server";
import {
  IdempotencyConflictError,
  OptimisticLockError,
  PaymentReplayConflictError,
  RepositoryNotFoundError,
} from "@/lib/db/repositories";

export function apiErrorResponse(error: unknown) {
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
  if (error instanceof IdempotencyKeyRequiredError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_IDEMPOTENCY_KEY" },
      { status: 400 },
    );
  }
  if (error instanceof ApplicationPermissionError) {
    return NextResponse.json({ error: error.message, code: "ROLE_FORBIDDEN" }, { status: 403 });
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
