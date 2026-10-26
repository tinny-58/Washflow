import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import {
  bookings,
  bookingItems,
  addresses,
  priceCatalog,
  catalogVersions,
  auditLog,
  users,
  vouchers,
} from "../db/schema";
import { getSessionFromReq } from "../lib/session";
import {
  getClientIpHash,
  getDeviceFingerprint,
  checkOpenBookingsLimit,
} from "../lib/security";
import { sanitizeText } from "../lib/sanitization";
import { notifyNewBooking } from "../lib/notifications/queue";
import { broadcastAdminEvent, sendClientEvent } from "../lib/sse";
import { isValidTransition } from "../lib/state-machine";
import { triggerBookingAutomation, type AutomationTriggerKey } from "../lib/baileys/automations";
import {
  redeemVoucherAtomic,
  evaluateOrderQualification,
  revertOrderQualification,
} from "../lib/rewards";
import { eq, inArray, desc, and, sql } from "drizzle-orm";

const router = Router();

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
  voucherId: z.string().uuid().optional(),
  posterSrc: z.string().max(100).optional(),
  catalogVersion: z.number().int().optional(),
  expectedSubtotal: z.number().int().optional(),
  confirmPriceChange: z.boolean().optional(),
});

// POST /api/bookings
router.post("/", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session || !session.userId) {
      return res.status(401).json({
        error: "Authentication required. Please sign in via phone OTP.",
      });
    }

    const parseResult = createBookingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid booking data",
        details: parseResult.error.flatten(),
      });
    }

    const {
      addressId: submittedAddressId,
      newAddress,
      items: submittedItems,
      pickupWindow,
      notes,
      paymentChoice,
      voucherId,
      posterSrc,
      catalogVersion: clientCatalogVersion,
      expectedSubtotal,
      confirmPriceChange,
    } = parseResult.data;

    // 2. Abuse check: Max 2 open bookings
    const { fingerprint } = getDeviceFingerprint(req, res);
    const openCheck = await checkOpenBookingsLimit(session.userId, fingerprint);

    if (!openCheck.allowed) {
      return res.status(403).json({
        error:
          "Active booking limit reached. You have 2 bookings currently being processed. Please await delivery before placing another order.",
      });
    }

    // 3. Resolve address with strict ownership verification
    let finalAddressId = submittedAddressId;
    if (finalAddressId) {
      const ownedAddress = await db.query.addresses.findFirst({
        where: and(eq(addresses.id, finalAddressId), eq(addresses.userId, session.userId)),
      });
      if (!ownedAddress) {
        return res.status(400).json({
          error: "Selected address is invalid or does not belong to your account.",
        });
      }
    } else {
      if (!newAddress) {
        return res.status(400).json({
          error: "Please provide a delivery address or select an existing one.",
        });
      }

      const sanitizedAddressText = sanitizeText(newAddress.addressText);
      const sanitizedLandmark = newAddress.landmark ? sanitizeText(newAddress.landmark) : undefined;

      const [createdAddress] = await db
        .insert(addresses)
        .values({
          userId: session.userId,
          label: newAddress.label || "Home",
          lat: newAddress.lat,
          lng: newAddress.lng,
          addressText: sanitizedAddressText,
          landmark: sanitizedLandmark,
        })
        .returning();

      finalAddressId = createdAddress.id;
    }

    // 4. Resolve prices from catalog (tamper-proof snapshotting)
    const catalogIds = submittedItems.map((i) => i.catalogId);
    const catalogRows = await db
      .select()
      .from(priceCatalog)
      .where(inArray(priceCatalog.id, catalogIds));

    if (catalogRows.length !== catalogIds.length) {
      return res.status(400).json({ error: "One or more selected catalog items are no longer available." });
    }

    const catalogMap = new Map<string, typeof priceCatalog.$inferSelect>(
      catalogRows.map((c) => [c.id, c])
    );

    let computedTotal = 0;
    const itemsToInsert: {
      catalogId: string;
      categorySnapshot: string;
      variantSnapshot: string;
      unitPriceSnapshot: number;
      qty: number;
      subtotal: number;
    }[] = [];

    for (const item of submittedItems) {
      const catalogItem = catalogMap.get(item.catalogId);
      if (!catalogItem || !catalogItem.active) {
        return res.status(400).json({
          error: `Item "${catalogItem?.variant || item.catalogId}" is currently out of service.`,
        });
      }

      const subtotal = catalogItem.price * item.qty;
      computedTotal += subtotal;

      itemsToInsert.push({
        catalogId: item.catalogId,
        categorySnapshot: catalogItem.category,
        variantSnapshot: catalogItem.variant,
        unitPriceSnapshot: catalogItem.price,
        qty: item.qty,
        subtotal,
      });
    }

    // 4a. Fetch current active catalog version and verify stale prices
    const [activeVersionRow] = await db
      .select()
      .from(catalogVersions)
      .where(eq(catalogVersions.id, 1))
      .limit(1);
    const activeCatalogVersion = activeVersionRow?.version || 1;

    // Detect stale prices if client provided expectedSubtotal and prices changed
    if (
      expectedSubtotal !== undefined &&
      expectedSubtotal !== computedTotal &&
      !confirmPriceChange
    ) {
      return res.status(409).json({
        error: "PRICE_CHANGED",
        message: "Catalog prices have been updated since you loaded the page. Please review the updated price.",
        oldSubtotal: expectedSubtotal,
        newSubtotal: computedTotal,
        catalogVersion: activeCatalogVersion,
      });
    }

    // 4b. Apply voucher discount if supplied
    let discountAmount = 0;
    let appliedVoucherId: string | null = null;
    const catalogItemIds = itemsToInsert.map((item) => item.catalogId);

    if (voucherId) {
      const voucher = await db.query.vouchers.findFirst({
        where: and(
          eq(vouchers.id, voucherId),
          eq(vouchers.clientId, session.userId),
          eq(vouchers.status, "available"),
          sql`${vouchers.expiresAt} > now()`
        ),
      });

      if (!voucher) {
        return res.status(400).json({
          error: "The selected voucher is invalid, expired, or already redeemed.",
        });
      }

      const eligibleIds: string[] = (voucher.eligibleItemIds as string[]) || [];
      if (eligibleIds.length > 0) {
        const matchesEligible = catalogItemIds.some((id) => eligibleIds.includes(id));
        if (!matchesEligible) {
          return res.status(400).json({
            error: "The selected voucher can only be applied to its designated eligible reward item.",
          });
        }
      }

      appliedVoucherId = voucher.id;
      discountAmount = Math.min(computedTotal, voucher.maxDiscountKes || 300);
    }

    const finalPayableTotal = Math.max(0, computedTotal - discountAmount);

    // 5. Create Booking
    const sanitizedNotes = notes ? sanitizeText(notes) : undefined;
    const ipHash = getClientIpHash(req);

    const [createdBooking] = await db
      .insert(bookings)
      .values({
        customerId: session.userId,
        addressId: finalAddressId,
        status: "PENDING",
        subtotal: computedTotal,
        discountAmount,
        total: finalPayableTotal,
        paymentStatus: finalPayableTotal === 0 ? "PAID" : "UNPAID",
        voucherId: appliedVoucherId,
        catalogVersion: activeCatalogVersion,
        pickupWindow,
        posterSrc: posterSrc || undefined,
        deviceFingerprint: fingerprint,
        ipHash,
        notes: sanitizedNotes,
        estimatedDeliveryAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // Standard 3-hour turnaround
      })
      .returning();

    // Atomic voucher redemption
    if (appliedVoucherId) {
      const redeemRes = await redeemVoucherAtomic({
        voucherId: appliedVoucherId,
        clientId: session.userId,
        orderId: createdBooking.id,
        orderSubtotal: computedTotal,
        catalogItemIds,
      });

      if (!redeemRes.success) {
        // Rollback created booking
        await db.delete(bookings).where(eq(bookings.id, createdBooking.id));
        return res.status(400).json({ error: redeemRes.error || "Failed to redeem voucher." });
      }
    }

    // 6. Insert Snapshot Items (persisting immutable unit price, variant, and category snapshots)
    await db.insert(bookingItems).values(
      itemsToInsert.map((item) => ({
        bookingId: createdBooking.id,
        catalogId: item.catalogId,
        qty: item.qty,
        unitPriceSnapshot: item.unitPriceSnapshot,
        variantSnapshot: item.variantSnapshot,
        categorySnapshot: item.categorySnapshot,
      }))
    );

    // 7. Audit log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "BOOKING_CREATED",
      entity: "bookings",
      entityId: createdBooking.id,
      meta: {
        total: finalPayableTotal,
        subtotal: computedTotal,
        discountAmount,
        voucherId: appliedVoucherId,
        itemCount: itemsToInsert.length,
        paymentChoice,
        posterSrc,
      },
    });

    // 8. Notifications & SSE Broadcast
    const customer = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (customer) {
      notifyNewBooking({
        bookingId: createdBooking.id,
        customerName: customer.name,
        customerPhone: customer.phone || customer.phoneE164 || "N/A",
        total: finalPayableTotal,
        pickupWindow,
        posterSrc: posterSrc || undefined,
      }).catch((err: any) => console.error("Notification queue error:", err));
    }

    sendClientEvent(session.userId, "ORDER_CREATED", {
      bookingId: createdBooking.id,
      status: createdBooking.status,
      total: finalPayableTotal,
      subtotal: computedTotal,
      discountAmount,
    });

    broadcastAdminEvent("new_booking", {
      id: createdBooking.id,
      customerId: session.userId,
      customerName: customer?.name || "Customer",
      customerPhone: customer?.phone || "",
      total: computedTotal,
      status: "PENDING",
      pickupWindow,
      posterSrc,
      createdAt: createdBooking.createdAt,
    });

    return res.status(201).json({
      success: true,
      bookingId: createdBooking.id,
      booking: createdBooking,
      items: itemsToInsert,
      paymentChoice,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    return res.status(500).json({ error: "Failed to create booking. Please try again." });
  }
});

// GET /api/bookings
router.get("/", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const userBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.customerId, session.userId))
      .orderBy(desc(bookings.createdAt));

    return res.json({ success: true, bookings: userBookings });
  } catch (error) {
    console.error("Fetch bookings error:", error);
    return res.status(500).json({ error: "Failed to fetch bookings." });
  }
});

// GET /api/bookings/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const bookingId = req.params.id;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        customer: true,
        address: true,
        items: true,
        payments: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    // Strict tenant isolation: foreign users receive 404 (anti-enumeration)
    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return res.status(404).json({ error: "Booking not found." });
    }

    return res.json({ success: true, booking });
  } catch (error) {
    console.error("Fetch booking detail error:", error);
    return res.status(500).json({ error: "Failed to load booking." });
  }
});

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

// PATCH /api/bookings/:id/status
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const bookingId = req.params.id;
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid status value", details: parseResult.error.flatten() });
    }

    const { status: targetStatus, notes } = parseResult.data;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    // Role verification
    if (session.role !== "admin") {
      if (booking.customerId !== session.userId) {
        return res.status(403).json({ error: "Unauthorized access." });
      }
      if (targetStatus !== "CANCELLED") {
        return res.status(403).json({ error: "Customers may only request cancellation." });
      }
    }

    // State machine check
    if (!isValidTransition(booking.status, targetStatus)) {
      return res.status(400).json({
        error: `Illegal state transition from "${booking.status}" to "${targetStatus}".`,
      });
    }

    // Perform transition
    const [updatedBooking] = await db
      .update(bookings)
      .set({
        status: targetStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    // Audit log
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "STATUS_TRANSITION",
      entity: "bookings",
      entityId: booking.id,
      meta: {
        fromStatus: booking.status,
        toStatus: targetStatus,
        notes: notes || undefined,
      },
    });

    // Trigger WhatsApp Automation for this status change
    const statusToTriggerMap: Record<string, AutomationTriggerKey> = {
      CONFIRMED: "BOOKING_CONFIRMED",
      PICKED_UP: "STATUS_PICKED_UP",
      WASHING: "STATUS_WASHING",
      READY: "STATUS_READY",
      OUT_FOR_DELIVERY: "STATUS_OUT_FOR_DELIVERY",
      DELIVERED: "STATUS_DELIVERED",
      CANCELLED: "STATUS_CANCELLED",
    };

    const triggerKey = statusToTriggerMap[targetStatus];
    if (triggerKey) {
      triggerBookingAutomation(booking.id, triggerKey, { customNote: notes }).catch((err) =>
        console.error(`[WashFlow Automations] Failed to trigger ${triggerKey}:`, err)
      );
    }

    // Evaluate qualification and loyalty points on Delivery if paid
    if (targetStatus === "DELIVERED" && updatedBooking.paymentStatus === "PAID") {
      evaluateOrderQualification(booking.id, "status_delivered").catch((err) =>
        console.error("[Rewards] Failed to evaluate order qualification on delivery:", err)
      );
    }

    // Revert qualification and restore voucher if cancelled
    if (targetStatus === "CANCELLED") {
      revertOrderQualification(booking.id, "Order cancelled").catch((err) =>
        console.error("[Rewards] Failed to revert order qualification on cancel:", err)
      );

      // Restore voucher if cancelled before pickup
      if (booking.voucherId && ["PENDING", "CONFIRMED"].includes(booking.status)) {
        db.update(vouchers)
          .set({ status: "available", redeemedOrderId: null, redeemedAt: null, updatedAt: new Date() })
          .where(eq(vouchers.id, booking.voucherId))
          .catch((err) => console.error("[Rewards] Failed to restore voucher on cancel:", err));
      }
    }

    broadcastAdminEvent("booking_updated", {
      id: booking.id,
      fromStatus: booking.status,
      toStatus: targetStatus,
      updatedAt: updatedBooking.updatedAt,
    });

    sendClientEvent(booking.customerId, "ORDER_STATUS_UPDATED", {
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: targetStatus,
      updatedAt: updatedBooking.updatedAt,
    });

    return res.json({
      success: true,
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Update status error:", error);
    return res.status(500).json({ error: "Failed to update booking status." });
  }
});

// POST /api/bookings/:id/ping-location (Ping live GPS coordinates for courier/rider)
router.post("/:id/ping-location", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session || !session.userId) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const bookingId = req.params.id;
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found." });
    }

    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    const { lat, lng, addressText, landmark, notes, accuracy } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number" || !addressText) {
      return res.status(400).json({ error: "Invalid location coordinates or address." });
    }

    const fullAddress = landmark ? `${addressText} (Near ${landmark})` : addressText;
    const pingTime = new Date();

    const [updatedBooking] = await db
      .update(bookings)
      .set({
        riderPingLat: lat,
        riderPingLng: lng,
        riderPingAddress: fullAddress,
        riderPingNotes: notes ? sanitizeText(notes) : null,
        riderPingAccuracy: accuracy || null,
        riderLocationPingedAt: pingTime,
        updatedAt: pingTime,
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    broadcastAdminEvent("RIDER_LOCATION_PINGED", {
      bookingId,
      customerName: session.name,
      lat,
      lng,
      addressText: fullAddress,
      notes,
      accuracy,
      timestamp: pingTime,
    });

    return res.json({
      success: true,
      message: "Live location sent to courier successfully.",
      booking: updatedBooking,
      ping: {
        lat,
        lng,
        addressText: fullAddress,
        accuracy: accuracy ? `±${Math.round(accuracy)}m` : "High GPS Accuracy",
        timestamp: pingTime.toISOString(),
      },
    });
  } catch (error) {
    console.error("Booking ping location error:", error);
    return res.status(500).json({ error: "Failed to update location ping." });
  }
});

export default router;
