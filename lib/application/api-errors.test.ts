import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { AuthenticationNotConfiguredError } from "@/lib/auth/types";

describe("API error mapping", () => {
  it("does not misclassify validation failures when Privy is unconfigured", async () => {
    const validation = z.object({ value: z.string() }).safeParse({ value: 1 });
    if (validation.success) throw new Error("Expected validation to fail");

    const response = apiErrorResponse(validation.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("maps explicit authentication configuration failures", async () => {
    const response = apiErrorResponse(new AuthenticationNotConfiguredError());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTHENTICATION_NOT_CONFIGURED" });
  });
});
