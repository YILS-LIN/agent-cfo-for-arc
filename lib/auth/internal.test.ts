import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InternalAuthenticationNotConfiguredError,
  InternalAuthenticationRequiredError,
  verifyInternalJobRequest,
} from "@/lib/auth/internal";

afterEach(() => vi.unstubAllEnvs());

describe("internal job authentication", () => {
  it("requires a sufficiently long configured secret", () => {
    vi.stubEnv("INTERNAL_JOB_SECRET", "short");
    expect(() => verifyInternalJobRequest(new Request("https://example.com"))).toThrow(
      InternalAuthenticationNotConfiguredError,
    );
  });

  it("uses an exact bearer secret comparison", () => {
    const secret = "a-secure-internal-job-secret-with-32-characters";
    vi.stubEnv("INTERNAL_JOB_SECRET", secret);

    expect(() =>
      verifyInternalJobRequest(
        new Request("https://example.com", { headers: { Authorization: "Bearer wrong" } }),
      ),
    ).toThrow(InternalAuthenticationRequiredError);
    expect(() =>
      verifyInternalJobRequest(
        new Request("https://example.com", {
          headers: { Authorization: `Bearer ${secret}` },
        }),
      ),
    ).not.toThrow();
  });
});
