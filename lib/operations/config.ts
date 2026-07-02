import { z } from "zod";

export class ProductionConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Production configuration is invalid: ${fields.join(", ")}`);
  }
}

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", {
    message: "must use HTTPS",
  });

const environmentSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => ["postgresql:", "postgres:"].includes(new URL(value).protocol)),
    DATABASE_DRIVER: z.enum(["postgres", "neon"]).optional(),
    NEXT_PUBLIC_SITE_URL: httpsUrl,
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
    PRIVY_APP_SECRET: z.string().min(20),
    PRIVY_VERIFICATION_KEY: z.string().min(20),
    SECRETS_ENCRYPTION_KEY: z.string().min(1),
    SECRETS_ENCRYPTION_KEY_ID: z.string().min(1),
    INTERNAL_JOB_SECRET: z.string().min(32),
    RATE_LIMIT_HASH_KEY: z.string().min(32),
    MCP_PUBLIC_URL: httpsUrl,
    MCP_OAUTH_ISSUER: httpsUrl,
    MCP_OAUTH_JWKS_URL: httpsUrl,
    MCP_OAUTH_AUDIENCE: httpsUrl,
    MCP_OAUTH_SIGNING_JWK: z.string().min(1),
    MCP_ALLOWED_ORIGINS: z.string().min(1),
  })
  .superRefine((environment, context) => {
    const key = Buffer.from(environment.SECRETS_ENCRYPTION_KEY, "base64");
    if (
      key.length !== 32 ||
      key.toString("base64").replaceAll("=", "") !==
        environment.SECRETS_ENCRYPTION_KEY.replaceAll("=", "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["SECRETS_ENCRYPTION_KEY"],
        message: "must be a base64-encoded 32-byte key",
      });
    }
    for (const origin of environment.MCP_ALLOWED_ORIGINS.split(",").map((item) => item.trim())) {
      try {
        const url = new URL(origin);
        if (url.protocol !== "https:" || url.origin !== origin) throw new Error();
      } catch {
        context.addIssue({
          code: "custom",
          path: ["MCP_ALLOWED_ORIGINS"],
          message: "must contain comma-separated HTTPS origins",
        });
        break;
      }
    }
  });

export function validateProductionEnvironment(environment: Record<string, string | undefined>) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment")),
    ];
    throw new ProductionConfigurationError(fields);
  }
  return result.data;
}
