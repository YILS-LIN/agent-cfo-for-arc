import { NextResponse } from "next/server";

import { demoArcAdapter } from "@/lib/arc/client";
import type { PaymentEvent } from "@/types/payment";

export async function POST(request: Request) {
  const payment = (await request.json()) as PaymentEvent;

  if (!payment?.id || !payment?.wallet || typeof payment.amount !== "number") {
    return NextResponse.json({ error: "Invalid payment payload." }, { status: 400 });
  }

  const result = await demoArcAdapter.ingestPayment(payment);

  return NextResponse.json(result, { status: 202 });
}
