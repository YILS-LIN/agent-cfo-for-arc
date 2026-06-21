import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDatabase } from "@/lib/db/client";
import { validateProductionEnvironment } from "@/lib/operations/config";
import { logError } from "@/lib/operations/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NODE_ENV === "production") validateProductionEnvironment(process.env);
    await getDatabase().execute(sql`select 1`);
    return NextResponse.json(
      { status: "ready", checks: { configuration: "ok", database: "ok" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const requestId = randomUUID();
    logError("readiness.failed", error, { requestId });
    return NextResponse.json(
      { status: "not_ready", requestId },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
    );
  }
}
