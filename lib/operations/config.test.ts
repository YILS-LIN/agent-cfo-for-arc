import { describe, expect, it } from "vitest";

import {
  ProductionConfigurationError,
  validateProductionEnvironment,
} from "@/lib/operations/config";

function validEnvironment() {
  return {
    DATABASE_URL: "postgresql://user:password@db.example.com/agent_cfo?sslmode=require",
    NEXT_PUBLIC_SITE_URL: "https://cfo.example.com",
    NEXT_PUBLIC_PRIVY_APP_ID: "privy-app",
    PRIVY_APP_SECRET: "privy-secret-at-least-twenty",
    PRIVY_VERIFICATION_KEY: "verification-key-at-least-twenty",
    SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    SECRETS_ENCRYPTION_KEY_ID: "v1",
    INTERNAL_JOB_SECRET: "i".repeat(32),
    RATE_LIMIT_HASH_KEY: "r".repeat(32),
    MCP_PUBLIC_URL: "https://cfo.example.com",
    MCP_OAUTH_ISSUER: "https://auth.example.com",
    MCP_OAUTH_JWKS_URL: "https://auth.example.com/.well-known/jwks.json",
    MCP_OAUTH_AUDIENCE: "https://cfo.example.com/mcp",
    MCP_ALLOWED_ORIGINS: "https://chatgpt.com,https://claude.ai",
  };
}

describe("production configuration", () => {
  it("accepts a complete production environment", () => {
    expect(validateProductionEnvironment(validEnvironment())).toMatchObject({
      NEXT_PUBLIC_SITE_URL: "https://cfo.example.com",
      SECRETS_ENCRYPTION_KEY_ID: "v1",
    });
  });

  it("rejects weak secrets, non-HTTPS URLs, and malformed encryption keys without exposing values", () => {
    const environment = {
      ...validEnvironment(),
      NEXT_PUBLIC_SITE_URL: "http://cfo.example.com",
      INTERNAL_JOB_SECRET: "secret",
      SECRETS_ENCRYPTION_KEY: "not-base64",
    };
    expect(() => validateProductionEnvironment(environment)).toThrow(ProductionConfigurationError);
    try {
      validateProductionEnvironment(environment);
    } catch (error) {
      expect(error).toMatchObject({
        fields: expect.arrayContaining([
          "NEXT_PUBLIC_SITE_URL",
          "INTERNAL_JOB_SECRET",
          "SECRETS_ENCRYPTION_KEY",
        ]),
      });
      expect((error as Error).message).not.toContain("not-base64");
    }
  });
});
