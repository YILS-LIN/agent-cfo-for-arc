import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { getDatabase } from "@/lib/db/client";
import { WorkspaceRepository } from "@/lib/db/repositories";

export class InternalAuthenticationRequiredError extends Error {}
export class InternalAuthenticationNotConfiguredError extends Error {}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifyInternalJobRequest(request: Request) {
  const expected = process.env.INTERNAL_JOB_SECRET;
  if (!expected || expected.length < 32) {
    throw new InternalAuthenticationNotConfiguredError(
      "INTERNAL_JOB_SECRET must contain at least 32 characters",
    );
  }
  const authorization = request.headers.get("Authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new InternalAuthenticationRequiredError("Internal job authentication failed");
  }
}

export function getInternalWorkspaceContext(workspaceId: string) {
  return new WorkspaceRepository(getDatabase()).getSystemContext(workspaceId);
}
