import { NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/application/api-errors";
import { syncWalletRequestSchema } from "@/lib/application/api-validation";
import { getAuthService } from "@/lib/auth/server";
import { getWorkspaceSyncService } from "@/lib/sync/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getAuthService().resolve(request);
    const { id } = await params;
    const input = syncWalletRequestSchema.parse(await request.json());
    const result = await getWorkspaceSyncService().sync(context, { walletId: id, ...input });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
