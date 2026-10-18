import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";

const simulateSchema = z.object({
  checkoutRequestId: z.string(),
  success: z.boolean().default(true),
  amount: z.number().int().positive(),
  phone: z.string().default("254700000000"),
  receiptNumber: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Only allowed in development / testing
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Simulator not available in production" }, { status: 403 });
  }

  try {
    const rawBody = await req.json();
    const { checkoutRequestId, success, amount, phone, receiptNumber } =
      simulateSchema.parse(rawBody);

    const receipt = receiptNumber || `QA${Date.now().toString().slice(-8)}`;

    const simulatedDarajaPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: `MR_${Date.now()}`,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: success ? 0 : 1032,
          ResultDesc: success ? "The service request is processed successfully." : "Request cancelled by user",
          ...(success
            ? {
                CallbackMetadata: {
                  Item: [
                    { Name: "Amount", Value: amount },
                    { Name: "MpesaReceiptNumber", Value: receipt },
                    { Name: "Balance" },
                    { Name: "TransactionDate", Value: Number(new Date().toISOString().replace(/\D/g, "").slice(0, 14)) },
                    { Name: "PhoneNumber", Value: Number(phone.replace(/\+/g, "")) },
                  ],
                },
              }
            : {}),
        },
      },
    };

    // Forward to callback handler
    const callbackRes = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/payments/mpesa/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(simulatedDarajaPayload),
    });

    const callbackData = await callbackRes.json();
    return NextResponse.json({
      success: true,
      simulatedPayload: simulatedDarajaPayload,
      callbackResult: callbackData,
    });
  } catch (error) {
    console.error("Simulation error:", error);
    return NextResponse.json({ error: "Failed to run simulation" }, { status: 500 });
  }
}
