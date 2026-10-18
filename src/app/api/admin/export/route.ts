import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, users, addresses, bookingItems, priceCatalog } from "@/db/schema";
import { requireAdminSession } from "@/lib/session";
import { eq, desc } from "drizzle-orm";

function escapeCsvField(field: unknown): string {
  if (field === null || field === undefined) return '""';
  const stringified = String(field).replace(/"/g, '""');
  return `"${stringified}"`;
}

export async function GET() {
  try {
    await requireAdminSession();

    const allBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        status: bookings.status,
        customerName: users.name,
        customerPhone: users.phone,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        pickupWindow: bookings.pickupWindow,
        subtotal: bookings.subtotal,
        tipAmount: bookings.tipAmount,
        total: bookings.total,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.customerId, users.id))
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .orderBy(desc(bookings.createdAt));

    const headers = [
      "Booking ID",
      "Created At",
      "Status",
      "Customer Name",
      "Customer Phone",
      "Address",
      "Landmark",
      "Pickup Window",
      "Subtotal (KES)",
      "Tip (KES)",
      "Total (KES)",
      "Payment Status",
      "Poster Source",
    ];

    const rows = allBookings.map((b) => [
      escapeCsvField(b.id),
      escapeCsvField(b.createdAt?.toISOString()),
      escapeCsvField(b.status),
      escapeCsvField(b.customerName),
      escapeCsvField(b.customerPhone),
      escapeCsvField(b.addressText),
      escapeCsvField(b.landmark),
      escapeCsvField(b.pickupWindow),
      escapeCsvField(b.subtotal),
      escapeCsvField(b.tipAmount),
      escapeCsvField(b.total),
      escapeCsvField(b.paymentStatus),
      escapeCsvField(b.posterSrc),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="washflow-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("CSV Export error:", error);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}
