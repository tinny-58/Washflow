import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { bookings, auditLog, users } from "@/db/schema";
import { requireAdminSession } from "@/lib/session";
import { isValidTransition, BookingStatus } from "@/lib/state-machine";
import { broadcastAdminEvent } from "@/lib/sse";
import { sendWhatsAppMessage } from "@/lib/notifications/whatsapp";
import { eq } from "drizzle-orm";

const updateStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PICKED_UP",
    "WASHING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ]),
  notes: z.string().max(255).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Enforce admin authentication
    const adminSession = await requireAdminSession();
    const { id: bookingId } = await params;

    const rawBody = await req.json();
    const parseResult = updateStatusSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid status transition request", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { status: targetStatus, notes } = parseResult.data;

    // 2. Fetch current booking
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // 3. Enforce legal state transitions
    const valid = isValidTransition(booking.status, targetStatus as BookingStatus);
    if (!valid) {
      return NextResponse.json(
        {
          error: `Illegal state transition: Cannot change status from "${booking.status}" to "${targetStatus}".`,
        },
        { status: 400 }
      );
    }

    // 4. Update status in DB
    const [updatedBooking] = await db
      .update(bookings)
      .set({
        status: targetStatus as BookingStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    // 5. Audit Log
    await db.insert(auditLog).values({
      actorId: adminSession.userId,
      action: "BOOKING_STATUS_CHANGED",
      entity: "bookings",
      entityId: bookingId,
      meta: {
        from: booking.status,
        to: targetStatus,
        notes,
      },
    });

    // 6. Broadcast SSE event to admin & customer tracking clients
    broadcastAdminEvent("STATUS_UPDATED", {
      bookingId,
      status: targetStatus,
      updatedAt: updatedBooking.updatedAt,
    });

    // 7. Notify customer of status change via WhatsApp
    const customer = await db.query.users.findFirst({
      where: eq(users.id, booking.customerId),
    });

    if (customer?.phone) {
      let statusMsg = "";
      switch (targetStatus) {
        case "CONFIRMED":
          statusMsg = `🧺 Hi ${customer.name}, your WashFlow laundry pickup is confirmed! Driver is on the way.`;
          break;
        case "PICKED_UP":
          statusMsg = `🚚 Hi ${customer.name}, your laundry has been picked up and is headed to our washing facility.`;
          break;
        case "WASHING":
          statusMsg = `🫧 Hi ${customer.name}, your clothes are currently being professionally washed & dried.`;
          break;
        case "READY":
          statusMsg = `✨ Hi ${customer.name}, your laundry is freshly folded and ready for delivery!`;
          break;
        case "OUT_FOR_DELIVERY":
          statusMsg = `🚴 Hi ${customer.name}, your clean laundry is out for delivery to your doorstep!`;
          break;
        case "DELIVERED":
          statusMsg = `🎉 Hi ${customer.name}, your laundry has been delivered! Please rate your experience: ${process.env.NEXT_PUBLIC_APP_URL}/rate/${bookingId}`;
          break;
        case "CANCELLED":
          statusMsg = `❌ Hi ${customer.name}, your laundry booking has been cancelled.`;
          break;
      }

      if (statusMsg) {
        sendWhatsAppMessage({
          toPhone: customer.phone,
          messageText: statusMsg,
        }).catch((err) => console.error("WhatsApp status update error:", err));
      }
    }

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Status update error:", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED_ADMIN") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to update booking status." }, { status: 500 });
  }
}
