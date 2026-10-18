import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { bookings, payments, auditLog, users } from "@/db/schema";
import { getSession } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { mpesaProvider } from "@/lib/payments/mpesa";
import { eq } from "drizzle-orm";

const stkRequestSchema = z.object({
  bookingId: z.string().uuid(),
  phone: z.string().min(5).optional(),
  amount: z.number().int().positive(),
  type: z.enum(["service", "tip"]).default("service"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rawBody = await req.json();
    const parseResult = stkRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid payment request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { bookingId, phone: submittedPhone, amount, type } = parseResult.data;

    // Fetch booking
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Verify ownership
    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Amount verification: Never trust client amount for service payment!
    if (type === "service") {
      if (amount !== booking.total) {
        return NextResponse.json(
          {
            error: `Payment amount (KES ${amount}) does not match booking total (KES ${booking.total}).`,
          },
          { status: 400 }
        );
      }
    }

    // Resolve customer phone
    const customerUser = await db.query.users.findFirst({
      where: eq(users.id, booking.customerId),
    });

    const targetPhone = normalizePhone(submittedPhone || customerUser?.phone || session.phone || "");
    if (!targetPhone) {
      return NextResponse.json(
        { error: "Invalid mobile phone number for M-Pesa push." },
        { status: 422 }
      );
    }

    // Initiate STK Push via Provider
    const result = await mpesaProvider.initiatePayment({
      bookingId,
      amount,
      phone: targetPhone,
      type,
    });

    // Record Pending Payment
    const [createdPayment] = await db
      .insert(payments)
      .values({
        bookingId,
        type,
        provider: "mpesa",
        providerRef: result.providerRef,
        amount,
        status: "PENDING",
      })
      .returning();

    // Audit Log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "MPESA_STK_INITIATED",
      entity: "payments",
      entityId: createdPayment.id,
      meta: {
        bookingId,
        amount,
        type,
        providerRef: result.providerRef,
      },
    });

    return NextResponse.json({
      success: true,
      providerRef: result.providerRef,
      message: result.customerMessage,
      paymentId: createdPayment.id,
    });
  } catch (error) {
    console.error("M-Pesa STK push error:", error);
    return NextResponse.json(
      { error: "Failed to initiate M-Pesa STK push. Please verify your phone number and try again." },
      { status: 500 }
    );
  }
}
