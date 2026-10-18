import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  bookings,
  bookingItems,
  addresses,
  priceCatalog,
  auditLog,
  users,
} from "@/db/schema";
import { getSession } from "@/lib/session";
import {
  getClientIpHash,
  getDeviceFingerprint,
  checkOpenBookingsLimit,
} from "@/lib/security";
import { sanitizeText } from "@/lib/sanitization";
import { notifyNewBooking } from "@/lib/notifications/queue";
import { broadcastAdminEvent } from "@/lib/sse";
import { eq, inArray, desc } from "drizzle-orm";

const bookingItemSchema = z.object({
  catalogId: z.string().uuid(),
  qty: z.number().int().min(1).max(50),
});

const newAddressSchema = z.object({
  label: z.string().min(1).max(50).default("Home"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressText: z.string().min(3).max(255),
  landmark: z.string().max(255).optional(),
});

const createBookingSchema = z.object({
  addressId: z.string().uuid().optional(),
  newAddress: newAddressSchema.optional(),
  items: z.array(bookingItemSchema).min(1, "Please select at least one item to wash"),
  pickupWindow: z.string().min(3).max(100),
  notes: z.string().max(500).optional(),
  paymentChoice: z.enum(["PAY_NOW", "PAY_ON_DELIVERY"]).default("PAY_NOW"),
  posterSrc: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate customer
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in via phone OTP." },
        { status: 401 }
      );
    }

    const rawBody = await req.json();
    const parseResult = createBookingSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid booking data", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      addressId: submittedAddressId,
      newAddress,
      items: submittedItems,
      pickupWindow,
      notes,
      paymentChoice,
      posterSrc,
    } = parseResult.data;

    // 2. Abuse check: Max 2 active open bookings per customer/device
    const { fingerprint } = await getDeviceFingerprint();
    const openCheck = await checkOpenBookingsLimit(session.userId, fingerprint);

    if (!openCheck.allowed) {
      return NextResponse.json(
        {
          error:
            "Active booking limit reached. You have 2 bookings currently being processed. Please await delivery before placing another order.",
        },
        { status: 403 }
      );
    }

    // 3. Resolve or create address
    let finalAddressId = submittedAddressId;

    if (!finalAddressId) {
      if (!newAddress) {
        return NextResponse.json(
          { error: "Please provide a delivery address or select an existing one." },
          { status: 400 }
        );
      }

      const [createdAddress] = await db
        .insert(addresses)
        .values({
          userId: session.userId,
          label: sanitizeText(newAddress.label) || "Home",
          lat: newAddress.lat,
          lng: newAddress.lng,
          addressText: sanitizeText(newAddress.addressText),
          landmark: sanitizeText(newAddress.landmark) || null,
        })
        .returning();

      finalAddressId = createdAddress.id;
    } else {
      // Verify address belongs to customer
      const existingAddr = await db.query.addresses.findFirst({
        where: eq(addresses.id, finalAddressId),
      });

      if (!existingAddr || existingAddr.userId !== session.userId) {
        return NextResponse.json({ error: "Invalid address selected." }, { status: 400 });
      }
    }

    // 4. Fetch dynamic pricing from price_catalog & snapshot
    const catalogIds = submittedItems.map((i) => i.catalogId);
    const catalogRecords = await db
      .select()
      .from(priceCatalog)
      .where(inArray(priceCatalog.id, catalogIds));

    if (catalogRecords.length !== catalogIds.length) {
      return NextResponse.json(
        { error: "One or more selected items are no longer available in the catalog." },
        { status: 400 }
      );
    }

    const catalogMap = new Map(catalogRecords.map((c) => [c.id, c]));

    let calculatedSubtotal = 0;
    const itemsToInsert: {
      catalogId: string;
      qty: number;
      unitPriceSnapshot: number;
    }[] = [];

    for (const item of submittedItems) {
      const catalogItem = catalogMap.get(item.catalogId);
      if (!catalogItem || !catalogItem.active) {
        return NextResponse.json(
          { error: `The item "${catalogItem?.variant || item.catalogId}" is currently inactive.` },
          { status: 400 }
        );
      }

      const itemTotal = item.qty * catalogItem.price;
      calculatedSubtotal += itemTotal;

      itemsToInsert.push({
        catalogId: item.catalogId,
        qty: item.qty,
        unitPriceSnapshot: catalogItem.price,
      });
    }

    const calculatedTotal = calculatedSubtotal; // tip_amount added later after delivery
    const initialPaymentStatus =
      paymentChoice === "PAY_ON_DELIVERY" ? "PAY_ON_DELIVERY" : "UNPAID";

    const ipHash = await getClientIpHash();

    // 5. Insert Booking
    const [createdBooking] = await db
      .insert(bookings)
      .values({
        customerId: session.userId,
        addressId: finalAddressId,
        pickupWindow: sanitizeText(pickupWindow),
        notes: sanitizeText(notes) || null,
        status: "PENDING",
        subtotal: calculatedSubtotal,
        tipAmount: 0,
        total: calculatedTotal,
        paymentStatus: initialPaymentStatus,
        deviceFingerprint: fingerprint,
        ipHash,
        posterSrc: sanitizeText(posterSrc) || null,
      })
      .returning();

    // 6. Insert Snapshot Items
    await db.insert(bookingItems).values(
      itemsToInsert.map((item) => ({
        bookingId: createdBooking.id,
        catalogId: item.catalogId,
        qty: item.qty,
        unitPriceSnapshot: item.unitPriceSnapshot,
      }))
    );

    // 7. Audit Log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "BOOKING_CREATED",
      entity: "bookings",
      entityId: createdBooking.id,
      meta: {
        total: calculatedTotal,
        paymentChoice,
        posterSrc,
      },
    });

    // 8. Enqueue Notifications for Admin & Broadcast SSE event
    const customerUser = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    const bookingNotificationPayload = {
      bookingId: createdBooking.id,
      customerName: customerUser?.name || session.name,
      customerPhone: customerUser?.phone || session.phone || "",
      total: calculatedTotal,
      pickupWindow: createdBooking.pickupWindow,
      posterSrc: createdBooking.posterSrc,
    };

    // Asynchronously notify (never blocks customer response)
    notifyNewBooking(bookingNotificationPayload).catch((err) => {
      console.error("Failed to enqueue booking notification:", err);
    });

    broadcastAdminEvent("NEW_BOOKING", {
      booking: {
        ...createdBooking,
        customerName: customerUser?.name,
        customerPhone: customerUser?.phone,
      },
    });

    return NextResponse.json({
      success: true,
      bookingId: createdBooking.id,
      booking: createdBooking,
    });
  } catch (error) {
    console.error("Booking creation error:", error);
    return NextResponse.json(
      { error: "Failed to create booking. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const customerBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, session.userId))
      .orderBy(desc(bookings.createdAt));

    return NextResponse.json({
      success: true,
      bookings: customerBookings,
    });
  } catch (error) {
    console.error("Failed to fetch customer bookings:", error);
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 });
  }
}
