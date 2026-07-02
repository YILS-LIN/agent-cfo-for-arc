import { describe, expect, it } from "vitest";

import { resolveDatabaseDriver } from "@/lib/db/client";

describe("database client driver selection", () => {
  it("uses the standard postgres driver for ordinary hostnames", () => {
    expect(
      resolveDatabaseDriver("postgresql://user:password@db.example.com:5432/app?sslmode=require"),
    ).toBe("postgres");
  });

  it("uses the standard postgres driver for ip address endpoints", () => {
    expect(
      resolveDatabaseDriver("postgresql://user:password@117.55.239.230:57104/app?sslmode=require"),
    ).toBe("postgres");
  });

  it("keeps neon endpoints on the serverless driver by default", () => {
    expect(
      resolveDatabaseDriver(
        "postgresql://user:password@ep-wild-water-a1b2c3.us-east-1.aws.neon.tech/app",
      ),
    ).toBe("neon");
  });

  it("allows an explicit driver override", () => {
    expect(
      resolveDatabaseDriver("postgresql://user:password@db.example.com/app", {
        databaseDriver: "neon",
      }),
    ).toBe("neon");
  });

  it("rejects invalid explicit driver overrides", () => {
    expect(() =>
      resolveDatabaseDriver("postgresql://user:password@db.example.com/app", {
        databaseDriver: "mysql",
      }),
    ).toThrow("DATABASE_DRIVER must be either postgres or neon");
  });
});
