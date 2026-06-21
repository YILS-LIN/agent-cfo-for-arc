import { describe, expect, it } from "vitest";

import { buildSecurityHeaders } from "@/lib/security/headers";

describe("security headers", () => {
  it("enforces production transport, framing, and content boundaries", () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders(true).map(({ key, value }) => [key, value]),
    );
    expect(headers["Strict-Transport-Security"]).toContain("includeSubDomains");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
    expect(headers["Content-Security-Policy"]).not.toContain("'unsafe-eval'");
  });

  it("allows the Next development runtime without weakening production", () => {
    const csp = buildSecurityHeaders(false).find(
      (header) => header.key === "Content-Security-Policy",
    );
    expect(csp?.value).toContain("'unsafe-eval'");
    expect(
      buildSecurityHeaders(false).some((header) => header.key === "Strict-Transport-Security"),
    ).toBe(false);
  });
});
