import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  bookings,
  users,
  addresses,
  bookingItems,
  priceCatalog,
  ratings,
  payments,
} from "@/db/schema";
import { requireAdminSession } from "@/lib/session";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { ALLOWED_TRANSITIONS, STATUS_METADATA } from "@/lib/state-machine";

export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");

    // Fetch all bookings
    const allBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        status: bookings.status,
        pickupWindow: bookings.pickupWindow,
        notes: bookings.notes,
        subtotal: bookings.subtotal,
        tipAmount: bookings.tipAmount,
        total: bookings.total,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
        customerId: bookings.customerId,
        customerName: users.name,
        customerPhone: users.phone,
        customerBlocked: users.isBlocked,
        addressId: bookings.addressId,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        lat: addresses.lat,
        lng: addresses.lng,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.customerId, users.id))
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .orderBy(desc(bookings.createdAt));

    // Calculate revenue metrics
    let grossRevenue = 0;
    let totalTips = 0;
    let deliveredCount = 0;
    let activeQueueCount = 0;

    for (const b of allBookings) {
      if (b.paymentStatus === "PAID" || b.status === "DELIVERED") {
        grossRevenue += b.total;
        totalTips += b.tipAmount;
      }
      if (b.status === "DELIVERED") {
        deliveredCount += 1;
      } else if (b.status !== "CANCELLED") {
        activeQueueCount += 1;
      }
    }

    // Filter if requested
    const filtered = statusFilter && statusFilter !== "ALL"
      ? allBookings.filter((b) => b.status === statusFilter)
      : allBookings;

    return NextResponse.json({
      success: true,
      metrics: {
        totalOrders: allBookings.length,
        activeQueueCount,
        deliveredCount,
        grossRevenue,
        totalTips,
      },
      bookings: filtered.map((b) => ({
        ...b,
        nextAllowedTransitions: ALLOWED_TRANSITIONS[b.status as keyof typeof ALLOWED_TRANSITIONS] || [],
        statusMeta: STATUS_METADATA[b.status as keyof typeof STATUS_METADATA],
      })),
    });
  } catch (error) {
    console.error("Admin bookings fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
