import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { payments, bookings, auditLog } from "@/db/schema";
import { mpesaProvider } from "@/lib/payments/mpesa";
import { broadcastAdminEvent } from "@/lib/sse";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // 1. Verify and parse callback structure via PaymentProvider
    const verification = await mpesaProvider.verifyCallback(rawBody);

    if (!verification.isValid || !verification.providerRef) {
      console.warn("Invalid M-Pesa callback payload received:", rawBody);
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Rejected - Invalid payload" });
    }

    // 2. Fetch existing payment record
    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.providerRef, verification.providerRef),
    });

    if (!existingPayment) {
      console.warn(`Payment with providerRef ${verification.providerRef} not found.`);
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted - Record not found" });
    }

    // 3. Idempotency Check: If already completed, do not process again
    if (existingPayment.status === "COMPLETED") {
      console.log(`Payment ${verification.providerRef} already completed (idempotent duplicate).`);
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted - Already processed" });
    }

    // 4. Handle Customer Cancellation or Failure
    if (!verification.isSuccess) {
      await db
        .update(payments)
        .set({
          status: "FAILED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      await db.insert(auditLog).values({
        action: "PAYMENT_FAILED_OR_CANCELLED",
        entity: "payments",
        entityId: existingPayment.id,
        meta: {
          providerRef: verification.providerRef,
          reason: verification.failureReason,
        },
      });

      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted - Failure recorded" });
    }

    // 5. Successful Payment Verification
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, existingPayment.bookingId),
    });

    if (!booking) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted - Booking missing" });
    }

    // Server-side amount comparison for service payments
    if (existingPayment.type === "service") {
      if (verification.amount < booking.total) {
        console.error(
          `Underpayment detected! Paid: ${verification.amount}, Required: ${booking.total}`
        );

        await db
          .update(payments)
          .set({
            status: "FAILED",
            rawCallbackJson: rawBody,
          })
          .where(eq(payments.id, existingPayment.id));

        await db.insert(auditLog).values({
          action: "PAYMENT_UNDERPAYMENT_FLAGGED",
          entity: "payments",
          entityId: existingPayment.id,
          meta: { paid: verification.amount, expected: booking.total },
        });

        return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted - Underpayment flagged" });
      }

      // Mark payment COMPLETED and booking PAID
      await db
        .update(payments)
        .set({
          status: "COMPLETED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      await db
        .update(bookings)
        .set({
          paymentStatus: "PAID",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    } else if (existingPayment.type === "tip") {
      // Tip payment: Mark payment COMPLETED, increment booking.tipAmount and booking.total
      await db
        .update(payments)
        .set({
          status: "COMPLETED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      await db
        .update(bookings)
        .set({
          tipAmount: booking.tipAmount + verification.amount,
          total: booking.total + verification.amount,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    }

    // 6. Audit Logging
    await db.insert(auditLog).values({
      action: "PAYMENT_COMPLETED_CALLBACK",
      entity: "payments",
      entityId: existingPayment.id,
      meta: {
        bookingId: booking.id,
        amount: verification.amount,
        type: existingPayment.type,
        receipt: verification.receiptNumber,
        providerRef: verification.providerRef,
      },
    });

    // 7. Realtime broadcast via SSE
    broadcastAdminEvent("PAYMENT_RECEIVED", {
      bookingId: booking.id,
      paymentId: existingPayment.id,
      amount: verification.amount,
      type: existingPayment.type,
      receipt: verification.receiptNumber,
    });

    // Standard Safaricom Daraja callback response
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("M-Pesa callback handling error:", error);
    return NextResponse.json(
      { ResultCode: 1, ResultDesc: "Internal server error" },
      { status: 500 }
    );
  }
}
