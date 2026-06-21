import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "agent-cfo-for-arc",
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? "unknown",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
