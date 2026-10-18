import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  bookings,
  bookingItems,
  addresses,
  priceCatalog,
  ratings,
  payments,
  users,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import { eq } from "drizzle-orm";
import { ALLOWED_TRANSITIONS, STATUS_METADATA } from "@/lib/state-machine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: bookingId } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    // Must be either the customer who owns the booking or an admin
    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load customer, address, items, payment, and rating
    const customer = await db.query.users.findFirst({
      where: eq(users.id, booking.customerId),
      columns: { id: true, name: true, phone: true },
    });

    const address = await db.query.addresses.findFirst({
      where: eq(addresses.id, booking.addressId),
    });

    const rawItems = await db
      .select({
        id: bookingItems.id,
        catalogId: bookingItems.catalogId,
        qty: bookingItems.qty,
        unitPriceSnapshot: bookingItems.unitPriceSnapshot,
        category: priceCatalog.category,
        variant: priceCatalog.variant,
      })
      .from(bookingItems)
      .leftJoin(priceCatalog, eq(bookingItems.catalogId, priceCatalog.id))
      .where(eq(bookingItems.bookingId, booking.id));

    const bookingPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.bookingId, booking.id));

    const bookingRating = await db.query.ratings.findFirst({
      where: eq(ratings.bookingId, booking.id),
    });

    return NextResponse.json({
      success: true,
      booking: {
        ...booking,
        customer,
        address,
        items: rawItems,
        payments: bookingPayments,
        rating: bookingRating || null,
        nextAllowedTransitions: ALLOWED_TRANSITIONS[booking.status] || [],
        statusMeta: STATUS_METADATA[booking.status],
      },
    });
  } catch (error) {
    console.error("Fetch booking error:", error);
    return NextResponse.json({ error: "Failed to load booking details." }, { status: 500 });
  }
}
