import "server-only";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import WebSocket from "ws";

import * as schema from "@/lib/db/schema";

let database: NeonDatabase<typeof schema> | undefined;
let pool: Pool | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): NeonDatabase<typeof schema> {
  if (database) return database;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for persistent data access");
  }

  neonConfig.webSocketConstructor = WebSocket;
  pool = new Pool({ connectionString: databaseUrl });
  database = drizzle(pool, { schema });
  return database;
}
