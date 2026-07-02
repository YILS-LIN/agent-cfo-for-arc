import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import WebSocket from "ws";

import type { AppDatabase } from "@/lib/db/database";
import * as schema from "@/lib/db/schema";

type DatabaseDriver = "postgres" | "neon";

let database: AppDatabase | undefined;
let pool: Pool | PgPool | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function resolveDatabaseDriver(
  databaseUrl: string,
  environment: { databaseDriver?: string } = { databaseDriver: process.env.DATABASE_DRIVER },
): DatabaseDriver {
  if (environment.databaseDriver === "postgres" || environment.databaseDriver === "neon") {
    return environment.databaseDriver;
  }

  if (environment.databaseDriver) {
    throw new Error("DATABASE_DRIVER must be either postgres or neon");
  }

  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return hostname.endsWith(".neon.tech") ? "neon" : "postgres";
}

function createNeonDatabase(databaseUrl: string): NeonDatabase<typeof schema> {
  neonConfig.webSocketConstructor = WebSocket;
  pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

function createPostgresDatabase(databaseUrl: string): NodePgDatabase<typeof schema> {
  pool = new PgPool({ connectionString: databaseUrl });
  return drizzleNodePostgres(pool, { schema });
}

export function getDatabase(): AppDatabase {
  if (database) return database;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for persistent data access");
  }

  database =
    resolveDatabaseDriver(databaseUrl) === "neon"
      ? createNeonDatabase(databaseUrl)
      : createPostgresDatabase(databaseUrl);
  return database;
}
