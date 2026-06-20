import { NextResponse } from "next/server";

import { getAiCredentialService } from "@/lib/ai/server";
import { apiErrorResponse } from "@/lib/application/api-errors";
import {
  deleteAiCredentialQuerySchema,
  storeAiCredentialRequestSchema,
} from "@/lib/application/api-validation";
import { getAuthService } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const input = storeAiCredentialRequestSchema.parse(await request.json());
    const credential = await getAiCredentialService().store(context, {
      provider: "openai",
      model: input.model ?? process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.5",
      secret: input.secret,
      expectedVersion: input.expectedVersion,
    });
    return NextResponse.json({ credential });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await getAuthService().resolve(request);
    const url = new URL(request.url);
    const input = deleteAiCredentialQuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = await getAiCredentialService().delete(context, {
      provider: "openai",
      expectedVersion: input.expectedVersion,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
