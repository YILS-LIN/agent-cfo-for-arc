import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";

let database: NeonHttpDatabase<typeof schema> | undefined;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase(): NeonHttpDatabase<typeof schema> {
  if (database) return database;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for persistent data access");
  }

  database = drizzle(neon(databaseUrl), { schema });
  return database;
}
