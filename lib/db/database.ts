import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core/session";

import type * as schema from "@/lib/db/schema";

export type AppDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export type WorkspaceScope = {
  workspaceId: string;
};
