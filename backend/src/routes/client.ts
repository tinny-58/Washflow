import { Router, Request, Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db";
import {
  bookings,
  bookingItems,
  auditLog,
} from "../db/schema";
import {
  getSessionFromReq,
  verifyPasswordConstantTime,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
} from "../lib/session";
import { eq, desc, and, inArray, sql, isNull, or } from "drizzle-orm";
import { getOrCreateUserReferralCode } from "../lib/rewards";
import {
  users,
  addresses,
  referrals,
  rewardPointsLedger,
  pointsLedger,
  rewardEntitlements,
  referralVisits,
  priceCatalog,
  notifications,
  payments,
  ratings,
  vouchers,
  loyaltyLedger,
  programSettings,
  sessions,
} from "../db/schema";
import { broadcastAdminEvent, clientSseManager, sendClientEvent } from "../lib/sse";
import { env } from "../lib/env";
import { sanitizeText } from "../lib/sanitization";
import { validatePasswordNist, normalizePhoneNumber } from "../lib/validation";
import { createAndStoreOtp, verifyAndConsumeOtp } from "../lib/otp";
import { checkNumberOnWhatsApp } from "../lib/baileys/queue";
import { getClientIp } from "../lib/security";

const router = Router();

// Middleware: Require Authenticated User
async function requireAuth(req: Request, res: Response, next: () => void) {
  const session = await getSessionFromReq(req);
  if (!session || !session.userId) {
    return res.status(401).json({ error: "Unauthorized. Please sign in." });
  }
  (req as any).session = session;
  next();
}

// ============================================================================
// 1. REALTIME SCOPED SSE (Client Specific Channel)
// ============================================================================
router.get("/sse", requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // Greet client subscriber
  res.write(
    `event: CONNECTED\ndata: ${JSON.stringify({ connected: true, userId: session.userId, time: new Date() })}\n\n`
  );

  const unsubscribe = clientSseManager.subscribe(session.userId, (formattedMessage) => {
    try {
      res.write(formattedMessage);
    } catch {
      unsubscribe();
    }
  });

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
  });
});

// ============================================================================
// 2. DASHBOARD OVERVIEW (Real-time Status & Milestones)
// ============================================================================
router.get("/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    let currentUser = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!currentUser) {
      return res.status(404).json({ error: "User profile not found." });
    }

    // Ensure user has an authoritative unguessable referral code
    if (!currentUser.referralCode) {
      currentUser.referralCode = await getOrCreateUserReferralCode(currentUser.id);
    }

    // 1. Fetch User Bookings
    const userBookings = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        status: bookings.status,
        pickupWindow: bookings.pickupWindow,
        notes: bookings.notes,
        total: bookings.total,
        subtotal: bookings.subtotal,
        discountAmount: bookings.discountAmount,
        tipAmount: bookings.tipAmount,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
        estimatedDeliveryAt: bookings.estimatedDeliveryAt,
        riderPingLat: bookings.riderPingLat,
        riderPingLng: bookings.riderPingLng,
        riderPingAddress: bookings.riderPingAddress,
        riderPingNotes: bookings.riderPingNotes,
        riderPingAccuracy: bookings.riderPingAccuracy,
        riderLocationPingedAt: bookings.riderLocationPingedAt,
        freeWashRedeemed: bookings.freeWashRedeemed,
        customerId: bookings.customerId,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        addressLat: addresses.lat,
        addressLng: addresses.lng,
      })
      .from(bookings)
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .where(eq(bookings.customerId, session.userId))
      .orderBy(desc(bookings.createdAt));

    // Active orders (orders that are not delivered or cancelled)
    const activeOrders = userBookings.filter(
      (b) => b.status !== "DELIVERED" && b.status !== "CANCELLED"
    );
    const activeBooking = activeOrders[0] || null;
    const activeOrdersCount = activeOrders.length;
    const amountsDueCount = userBookings.filter(
      (b) => b.status !== "CANCELLED" && b.paymentStatus !== "PAID"
    ).length;

    const completedWashes = userBookings.filter(
      (b) => b.status === "DELIVERED" && b.paymentStatus === "PAID"
    ).length;

    // 2. Fetch Points from points_ledger
    const [refBalRes] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal 
        FROM points_ledger 
        WHERE client_id = ${session.userId} AND track = 'referral'
      `)
    ).rows as any[];

    const [loyaltyBalRes] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal 
        FROM points_ledger 
        WHERE client_id = ${session.userId} AND track = 'loyalty'
      `)
    ).rows as any[];

    const referralPoints = Number(refBalRes?.bal || 0);
    const loyaltyPoints = Number(loyaltyBalRes?.bal || 0);

    // 3. Fetch Available / Approved Vouchers (Real data, hidden at zero)
    const activeVouchers = await db
      .select()
      .from(vouchers)
      .where(
        and(
          eq(vouchers.clientId, session.userId),
          eq(vouchers.status, "available"),
          sql`${vouchers.expiresAt} > now()`
        )
      )
      .orderBy(desc(vouchers.createdAt));

    // 4. Milestone progress calculations
    const referralProgress = {
      current: referralPoints % 500,
      target: 500,
      points: referralPoints,
      cycle: Math.floor(referralPoints / 500) + 1,
      totalPoints: referralPoints,
      readyToClaim: activeVouchers.some((v) => v.source === "referral"),
    };

    const loyaltyProgress = {
      current: loyaltyPoints % 100,
      target: 100,
      points: loyaltyPoints,
      cycle: Math.floor(loyaltyPoints / 100) + 1,
      totalPoints: loyaltyPoints,
      readyToClaim: activeVouchers.some((v) => v.source === "loyalty"),
    };

    // 5. Unread notifications
    const unreadNotificationsResult = await db.execute(sql`
      SELECT count(*)::int as c FROM notifications WHERE user_id = ${session.userId} AND is_read = false
    `);
    const unreadNotificationsCount = Number(unreadNotificationsResult.rows[0]?.c || 0);

    const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const referralShareUrl = `${appUrl}/r/${currentUser.referralCode}`;

    // Pending payments list (for Dashboard Block 3)
    const pendingOrders = userBookings
      .filter((b) => b.status !== "CANCELLED" && b.paymentStatus !== "PAID")
      .map((b) => ({
        id: b.id,
        orderId: b.id,
        status: b.status,
        total: b.total,
        pickupWindow: b.pickupWindow,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt,
      }));

    // Last 3 recent orders (for Dashboard Block 5)
    const recentOrders = userBookings.slice(0, 3).map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      status: b.status,
      pickupWindow: b.pickupWindow,
      total: b.total,
      paymentStatus: b.paymentStatus,
      addressText: b.addressText,
    }));

    const isLastOrderDelivered = userBookings.length > 0 && userBookings[0].status === "DELIVERED";
    const referralsRemaining = Math.max(1, Math.ceil((500 - (referralPoints % 500)) / 100));

    return res.json({
      success: true,
      client: {
        id: currentUser.id,
        name: currentUser.name,
        username: currentUser.username || undefined,
        businessName: currentUser.businessName || undefined,
        email: currentUser.email,
        phone: currentUser.phone || currentUser.phoneE164,
        role: currentUser.role,
        referralCode: currentUser.referralCode,
        referralShareUrl,
        whatsappNotifications: currentUser.whatsappNotifications,
      },
      activeOrder: activeBooking || null,
      pendingPayments: pendingOrders,
      recentOrders,
      isLastOrderDelivered,
      referralsRemaining,
      milestones: {
        referrals: referralProgress,
        loyalty: loyaltyProgress,
      },
      availableVouchers: activeVouchers,
      unreadNotificationsCount,
      stats: {
        totalOrders: userBookings.length,
        completedWashes,
        activeOrdersCount,
        amountsDueCount,
        claimsUnreadRepliesCount: 0,
        availableVouchersCount: activeVouchers.length,
        totalQualifiedReferrals: Math.floor(referralPoints / 100),
      },
    });
  } catch (error) {
    console.error("Client overview error:", error);
    return res.status(500).json({ error: "Failed to load client portal dashboard." });
  }
});

// ============================================================================
// 3. MY ORDERS (Client-Scoped)
// ============================================================================
router.get("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const statusFilter = req.query.status as string | undefined;

    const userOrders = await db
      .select({
        id: bookings.id,
        createdAt: bookings.createdAt,
        updatedAt: bookings.updatedAt,
        status: bookings.status,
        pickupWindow: bookings.pickupWindow,
        notes: bookings.notes,
        subtotal: bookings.subtotal,
        discountAmount: bookings.discountAmount,
        tipAmount: bookings.tipAmount,
        total: bookings.total,
        paymentStatus: bookings.paymentStatus,
        posterSrc: bookings.posterSrc,
        estimatedDeliveryAt: bookings.estimatedDeliveryAt,
        addressText: addresses.addressText,
        landmark: addresses.landmark,
        addressLabel: addresses.label,
        addressLat: addresses.lat,
        addressLng: addresses.lng,
        voucherId: bookings.voucherId,
      })
      .from(bookings)
      .leftJoin(addresses, eq(bookings.addressId, addresses.id))
      .where(
        statusFilter && statusFilter !== "ALL"
          ? and(eq(bookings.customerId, session.userId), eq(bookings.status, statusFilter as any))
          : eq(bookings.customerId, session.userId)
      )
      .orderBy(desc(bookings.createdAt));

    return res.json({ success: true, orders: userOrders });
  } catch (error) {
    console.error("Fetch client orders error:", error);
    return res.status(500).json({ error: "Failed to fetch orders." });
  }
});

// GET /api/client/orders/:id (Detail view with items, payments, rating)
router.get("/orders/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const orderId = req.params.id;

    const order = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, orderId), eq(bookings.customerId, session.userId)),
      with: {
        address: true,
        items: {
          with: {
            catalogItem: true,
          },
        },
        payments: true,
        rating: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    return res.json({ success: true, order });
  } catch (error) {
    console.error("Fetch client order detail error:", error);
    return res.status(500).json({ error: "Failed to load order details." });
  }
});

// POST /api/client/orders/:id/cancel (Cancellation inside allowed window)
router.post("/orders/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const orderId = req.params.id;

    const order = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, orderId), eq(bookings.customerId, session.userId)),
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    // Cancellation rule: only allowed while PENDING or CONFIRMED (before pickup)
    if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
      return res.status(400).json({
        error: `Order cannot be cancelled in status "${order.status}". Cancellation is only allowed prior to rider pickup.`,
      });
    }

    // Atomic update: cancel order and restore any redeemed voucher
    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          status: "CANCELLED",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, order.id));

      if (order.voucherId) {
        await tx
          .update(vouchers)
          .set({
            status: "available",
            redeemedOrderId: null,
            redeemedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(vouchers.id, order.voucherId));
      }

      await tx.insert(auditLog).values({
        actorId: session.userId,
        action: "ORDER_CANCELLED_BY_CLIENT",
        entity: "bookings",
        entityId: order.id,
        meta: { previousStatus: order.status, voucherRestored: Boolean(order.voucherId) },
      });
    });

    sendClientEvent(session.userId, "ORDER_STATUS_UPDATED", {
      bookingId: order.id,
      fromStatus: order.status,
      toStatus: "CANCELLED",
      updatedAt: new Date(),
    });

    broadcastAdminEvent("booking_updated", {
      id: order.id,
      fromStatus: order.status,
      toStatus: "CANCELLED",
      updatedAt: new Date(),
    });

    return res.json({
      success: true,
      message: "Your order has been cancelled successfully.",
    });
  } catch (error) {
    console.error("Cancel client order error:", error);
    return res.status(500).json({ error: "Failed to cancel order." });
  }
});

// ============================================================================
// 4. REWARDS, REFERRALS & VOUCHERS
// ============================================================================
router.get("/rewards", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Ensure referral code
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = await getOrCreateUserReferralCode(user.id);
    }

    // 1. Fetch Points from points_ledger
    const [refBalRes] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal,
               COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0)::int as cumulative
        FROM points_ledger 
        WHERE client_id = ${session.userId} AND track = 'referral'
      `)
    ).rows as any[];

    const [loyaltyBalRes] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal 
        FROM points_ledger 
        WHERE client_id = ${session.userId} AND track = 'loyalty'
      `)
    ).rows as any[];

    const referralPoints = Number(refBalRes?.bal || 0);
    const cumulativeReferralPoints = Number(refBalRes?.cumulative || 0);
    const loyaltyPoints = Number(loyaltyBalRes?.bal || 0);

    // 2. Fetch Personal Link Funnel
    const [visitCountRes] = (
      await db.execute(sql`
        SELECT count(*)::int as c FROM referral_visits WHERE code = ${referralCode}
      `)
    ).rows as any[];

    const linkVisits = Number(visitCountRes?.c || 0);

    // 3. Referees list (Strict privacy: first initial "J•••", stage chip, plain why pending)
    const referees = await db
      .select({
        id: referrals.id,
        status: referrals.status,
        signedUpAt: referrals.signedUpAt,
        bookedAt: referrals.bookedAt,
        deliveredAt: referrals.deliveredAt,
        paidAt: referrals.paidAt,
        qualifiedAt: referrals.qualifiedAt,
        createdAt: referrals.createdAt,
        refereeName: users.name,
      })
      .from(referrals)
      .leftJoin(users, eq(referrals.referredUserId, users.id))
      .where(eq(referrals.referrerId, session.userId))
      .orderBy(desc(referrals.createdAt));

    const maskedReferees = referees.map((r) => {
      const rawName = (r.refereeName || "Customer").trim();
      const firstInitial = rawName.charAt(0).toUpperCase() || "C";
      const maskedName = `${firstInitial}•••`;

      // Stage Chip & Plain "Why Pending" Help Text
      let stage = "Signed up";
      let whyPending = "Account created. Awaiting their first laundry booking.";

      if (r.status === "qualified" || r.status === "COMPLETED") {
        stage = "Qualified";
        whyPending = "Delivery & payment verified! +100 referral points credited to your wallet.";
      } else if (r.status === "flagged") {
        stage = "Under review";
        whyPending = "Under routine security check before points release.";
      } else if (r.status === "voided") {
        stage = "Not eligible";
        whyPending = "Order did not meet minimum qualifying criteria.";
      } else if (r.deliveredAt && !r.paidAt) {
        stage = "Waiting for payment";
        whyPending = "Laundry delivered! Awaiting M-Pesa payment confirmation to qualify.";
      } else if (r.deliveredAt) {
        stage = "Delivered";
        whyPending = "Order delivered. Finalizing verification.";
      } else if (r.bookedAt) {
        stage = "Booked";
        whyPending = "Order scheduled. Will qualify upon successful delivery and payment.";
      }

      return {
        id: r.id,
        name: maskedName,
        status: r.status,
        stage,
        whyPending,
        signedUpDate: r.signedUpAt || r.createdAt,
        qualifiedDate: r.qualifiedAt,
      };
    });

    const totalSignedUp = referees.length;
    const totalBooked = referees.filter((r) => r.bookedAt !== null).length;
    const totalDelivered = referees.filter((r) => r.deliveredAt !== null).length;
    const totalQualified = referees.filter(
      (r) => r.status === "qualified" || r.status === "COMPLETED"
    ).length;

    // 4. Rewards Wallet (Entitlements + Vouchers)
    const [pendingEntitlements, clientVouchers] = await Promise.all([
      db
        .select()
        .from(rewardEntitlements)
        .where(
          and(
            eq(rewardEntitlements.clientId, session.userId),
            eq(rewardEntitlements.status, "pending_approval")
          )
        )
        .orderBy(desc(rewardEntitlements.createdAt)),
      db
        .select()
        .from(vouchers)
        .where(eq(vouchers.clientId, session.userId))
        .orderBy(desc(vouchers.createdAt)),
    ]);

    const wallet = {
      pendingApproval: pendingEntitlements.map((e) => ({
        id: e.id,
        milestoneKey: e.milestoneKey,
        title: e.milestoneKey === "exclusive_1000" ? "Exclusive Reward (Large Basket)" : "Standard Reward (Choice of 3)",
        pointsSnapshot: e.pointsSnapshot,
        status: e.status,
        createdAt: e.createdAt,
      })),
      approved: clientVouchers.filter(
        (v) => v.status === "available" && new Date(v.expiresAt) > new Date()
      ),
      used: clientVouchers.filter((v) => v.status === "redeemed"),
      expired: clientVouchers.filter(
        (v) => v.status === "expired" || (v.status === "available" && new Date(v.expiresAt) <= new Date())
      ),
    };

    // 5. Loyalty History from Ledger
    const loyaltyLedgerHistory = await db
      .select({
        id: pointsLedger.id,
        delta: pointsLedger.delta,
        reason: pointsLedger.reason,
        balanceAfter: pointsLedger.balanceAfter,
        createdAt: pointsLedger.createdAt,
      })
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.clientId, session.userId),
          eq(pointsLedger.track, "loyalty")
        )
      )
      .orderBy(desc(pointsLedger.createdAt))
      .limit(10);

    // 6. Real Catalog Reward Options (Images, Variants, Prices)
    const activeCatalogItems = await db.query.priceCatalog.findMany({
      where: eq(priceCatalog.active, true),
    });

    const standardRewardOptions = activeCatalogItems.filter(
      (item) =>
        item.variant.includes("Small Basket") ||
        item.variant.includes("Single / 3x5") ||
        item.variant.includes("Small Doormat")
    );

    const exclusiveRewardOptions = activeCatalogItems.filter((item) =>
      item.variant.includes("Large Basket")
    );

    // 7. Program settings
    const settings = await db.query.programSettings.findFirst({
      orderBy: desc(programSettings.version),
    });

    const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const shareUrl = `${appUrl}/r/${referralCode}`;
    const defaultTemplate =
      settings?.whatsappTemplateReferralShare ||
      "Hey! Get your laundry done professionally with WashFlow. Book using my link and get express pickup & delivery: {{shareUrl}}";
    const renderedMsg = defaultTemplate.replace("{{shareUrl}}", shareUrl);
    const whatsappShareLink = `https://wa.me/?text=${encodeURIComponent(renderedMsg)}`;

    // Next Reward Calculation
    let nextRewardName = "Standard Reward (Choice of Small Basket, Duvet, or Mat)";
    let pointsNeeded = 500 - (referralPoints % 500);
    if (referralPoints >= 500 && referralPoints < 1000) {
      nextRewardName = "Exclusive Reward (Free Large Basket up to 15 kg)";
      pointsNeeded = 1000 - referralPoints;
    }

    return res.json({
      success: true,
      header: {
        referralPoints,
        cumulativeReferralPoints,
        loyaltyPoints,
        nextReward: {
          name: nextRewardName,
          pointsNeeded,
          targetPoints: referralPoints < 500 ? 500 : 1000,
          currentPoints: referralPoints < 500 ? referralPoints : referralPoints - 500,
        },
      },
      share: {
        code: referralCode,
        shareUrl,
        whatsappShareLink,
        renderedShareText: renderedMsg,
      },
      milestones: {
        standard: {
          targetPoints: 500,
          currentPoints: Math.min(cumulativeReferralPoints, 500),
          isReached: cumulativeReferralPoints >= 500,
          capKes: settings?.standardRewardMaxCapKes || 300,
          options: standardRewardOptions,
        },
        exclusive: {
          targetPoints: 1000,
          currentPoints: Math.min(cumulativeReferralPoints, 1000),
          isReached: cumulativeReferralPoints >= 1000,
          capKes: settings?.exclusiveRewardMaxCapKes || 450,
          options: exclusiveRewardOptions,
        },
      },
      funnel: {
        linkVisits,
        signedUp: totalSignedUp,
        booked: totalBooked,
        delivered: totalDelivered,
        qualified: totalQualified,
      },
      referees: maskedReferees,
      wallet,
      loyalty: {
        pointsBalance: loyaltyPoints,
        pointsPerBooking: settings?.loyaltyPointsPerPaidOrder || 10,
        progressCurrent: loyaltyPoints % (settings?.loyaltyRedemptionPoints || 100),
        progressTarget: settings?.loyaltyRedemptionPoints || 100,
        pointsToNextReward:
          (settings?.loyaltyRedemptionPoints || 100) -
          (loyaltyPoints % (settings?.loyaltyRedemptionPoints || 100)),
        rewardDescription: "1 Free Small Basket Wash (up to KES 300)",
        history: loyaltyLedgerHistory,
      },
      programRules: {
        standardRewardMilestonePoints: settings?.standardRewardMilestonePoints || 500,
        exclusiveRewardMilestonePoints: settings?.exclusiveRewardMilestonePoints || 1000,
        minOrderValueKes: settings?.minOrderValueKes || 300,
        standardRewardCapKes: settings?.standardRewardMaxCapKes || 300,
        exclusiveRewardCapKes: settings?.exclusiveRewardMaxCapKes || 450,
        voucherValidityDays: settings?.voucherValidityDays || 90,
        version: settings?.version || 1,
        programActive: settings?.programActive ?? true,
      },
    });
  } catch (error) {
    console.error("Fetch client rewards error:", error);
    return res.status(500).json({ error: "Failed to load rewards program." });
  }
});

// ============================================================================
// 5. SAVED ADDRESSES (Client-Scoped CRUD)
// ============================================================================
const addressSchema = z.object({
  label: z.string().min(1).max(50).default("Home"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressText: z.string().min(3).max(255),
  landmark: z.string().max(255).optional(),
});

router.get("/addresses", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const clientAddresses = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, session.userId))
      .orderBy(desc(addresses.createdAt));

    return res.json({ success: true, addresses: clientAddresses });
  } catch (error) {
    console.error("Fetch addresses error:", error);
    return res.status(500).json({ error: "Failed to fetch addresses." });
  }
});

router.post("/addresses", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = addressSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid address payload", details: parse.error.flatten() });
    }

    const { label, lat, lng, addressText, landmark } = parse.data;

    const [newAddress] = await db
      .insert(addresses)
      .values({
        userId: session.userId,
        label: sanitizeText(label),
        lat,
        lng,
        addressText: sanitizeText(addressText),
        landmark: landmark ? sanitizeText(landmark) : null,
      })
      .returning();

    return res.status(201).json({ success: true, address: newAddress });
  } catch (error) {
    console.error("Create address error:", error);
    return res.status(500).json({ error: "Failed to save address." });
  }
});

router.patch("/addresses/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const addressId = req.params.id;
    const parse = addressSchema.partial().safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid update payload" });
    }

    const existing = await db.query.addresses.findFirst({
      where: and(eq(addresses.id, addressId), eq(addresses.userId, session.userId)),
    });

    if (!existing) {
      return res.status(404).json({ error: "Address not found." });
    }

    const updateFields: Record<string, any> = {};
    if (parse.data.label) updateFields.label = sanitizeText(parse.data.label);
    if (parse.data.lat !== undefined) updateFields.lat = parse.data.lat;
    if (parse.data.lng !== undefined) updateFields.lng = parse.data.lng;
    if (parse.data.addressText) updateFields.addressText = sanitizeText(parse.data.addressText);
    if (parse.data.landmark !== undefined) updateFields.landmark = parse.data.landmark ? sanitizeText(parse.data.landmark) : null;

    const [updated] = await db
      .update(addresses)
      .set(updateFields)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, session.userId)))
      .returning();

    return res.json({ success: true, address: updated });
  } catch (error) {
    console.error("Update address error:", error);
    return res.status(500).json({ error: "Failed to update address." });
  }
});

router.delete("/addresses/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const addressId = req.params.id;

    const existing = await db.query.addresses.findFirst({
      where: and(eq(addresses.id, addressId), eq(addresses.userId, session.userId)),
    });

    if (!existing) {
      return res.status(404).json({ error: "Address not found." });
    }

    await db
      .delete(addresses)
      .where(and(eq(addresses.id, addressId), eq(addresses.userId, session.userId)));

    return res.json({ success: true, message: "Address deleted successfully." });
  } catch (error) {
    console.error("Delete address error:", error);
    return res.status(500).json({ error: "Failed to delete address." });
  }
});

// ============================================================================
// 6. PAYMENTS & AUTHORIZED RECEIPTS
// ============================================================================
router.get("/payments", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    const clientPayments = await db
      .select({
        id: payments.id,
        bookingId: payments.bookingId,
        type: payments.type,
        provider: payments.provider,
        providerRef: payments.providerRef,
        amount: payments.amount,
        status: payments.status,
        createdAt: payments.createdAt,
        bookingStatus: bookings.status,
        bookingTotal: bookings.total,
      })
      .from(payments)
      .innerJoin(bookings, eq(payments.bookingId, bookings.id))
      .where(eq(bookings.customerId, session.userId))
      .orderBy(desc(payments.createdAt));

    return res.json({ success: true, payments: clientPayments });
  } catch (error) {
    console.error("Fetch client payments error:", error);
    return res.status(500).json({ error: "Failed to fetch payment records." });
  }
});

router.get("/payments/:id/receipt", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const paymentId = req.params.id;

    const payment = await db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
      with: {
        booking: {
          with: {
            address: true,
            customer: true,
            items: {
              with: {
                catalogItem: true,
              },
            },
          },
        },
      },
    });

    if (!payment || !payment.booking || payment.booking.customerId !== session.userId) {
      return res.status(404).json({ error: "Payment receipt not found." });
    }

    const receiptData = {
      receiptNumber: payment.providerRef,
      paymentId: payment.id,
      bookingId: payment.booking.id,
      date: payment.createdAt,
      customerName: payment.booking.customer.name,
      customerPhone: payment.booking.customer.phone || payment.booking.customer.phoneE164,
      deliveryAddress: payment.booking.address.addressText,
      landmark: payment.booking.address.landmark,
      items: payment.booking.items.map((i) => ({
        variant: i.catalogItem?.variant || "Laundry Item",
        category: i.catalogItem?.category || "basket",
        qty: i.qty,
        unitPrice: i.unitPriceSnapshot,
        subtotal: i.qty * i.unitPriceSnapshot,
      })),
      subtotal: payment.booking.subtotal,
      discount: payment.booking.discountAmount || 0,
      tip: payment.booking.tipAmount || 0,
      totalPaid: payment.amount,
      provider: payment.provider,
      status: payment.status,
    };

    return res.json({ success: true, receipt: receiptData });
  } catch (error) {
    console.error("Fetch receipt error:", error);
    return res.status(500).json({ error: "Failed to generate receipt." });
  }
});

// ============================================================================
// 7. PROFILE, SESSIONS & SECURITY
// ============================================================================
router.get("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    return res.json({
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone || user.phoneE164,
        businessName: user.businessName,
        role: user.role,
        authProvider: user.authProvider,
        phoneVerifiedAt: user.phoneVerifiedAt,
        whatsappNotifications: user.whatsappNotifications,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load profile." });
  }
});

// Update profile name / businessName
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  businessName: z.string().max(100).optional(),
});

router.patch("/profile", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = updateProfileSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid profile data" });
    }

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parse.data.name) updateData.name = sanitizeText(parse.data.name);
    if (parse.data.businessName !== undefined) updateData.businessName = sanitizeText(parse.data.businessName);

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, session.userId))
      .returning();

    return res.json({ success: true, profile: updated });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

// Change Password
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(10).max(128),
});

router.post("/profile/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = changePasswordSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Password must be at least 10 characters." });
    }

    const { currentPassword, newPassword } = parse.data;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // If user has an existing password, verify current password
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required." });
      }

      const isValid = await verifyPasswordConstantTime({
        candidatePassword: currentPassword,
        storedHash: user.passwordHash,
      });

      if (!isValid) {
        return res.status(401).json({ error: "Incorrect current password." });
      }
    }

    // Validate new password per NIST
    const passCheck = await validatePasswordNist(newPassword);
    if (!passCheck.valid) {
      return res.status(422).json({ error: passCheck.error });
    }

    const newHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to update password." });
  }
});

// Active Sessions List
router.get("/profile/sessions", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const currentToken = req.cookies?.[SESSION_COOKIE_NAME] || req.cookies?.["wf_session"];
    const currentHash = currentToken ? hashSessionToken(currentToken) : null;

    const activeSessions = await db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipHash: sessions.ipHash,
        createdAt: sessions.createdAt,
        lastActiveAt: sessions.lastActiveAt,
        sessionTokenHash: sessions.sessionTokenHash,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, session.userId), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastActiveAt));

    const formatted = activeSessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent || "Unknown Browser / Device",
      ipMasked: s.ipHash ? `IP ***${s.ipHash.slice(-4)}` : "Masked",
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
      isCurrent: s.sessionTokenHash === currentHash,
    }));

    return res.json({ success: true, sessions: formatted });
  } catch (error) {
    return res.status(500).json({ error: "Failed to load active sessions." });
  }
});

// Revoke Session
router.post("/profile/sessions/:id/revoke", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const sessionId = req.params.id;

    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, session.userId)));

    return res.json({ success: true, message: "Session revoked successfully." });
  } catch (error) {
    return res.status(500).json({ error: "Failed to revoke session." });
  }
});

// Change Phone Number: Step 1 (Request OTP on new number)
const phoneChangeSchema = z.object({
  newPhone: z.string().min(5).max(30),
});

router.post("/profile/phone/request-otp", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = phoneChangeSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid mobile phone number format." });
    }

    const phoneNorm = normalizePhoneNumber(parse.data.newPhone);
    if (!phoneNorm.valid || !phoneNorm.e164) {
      return res.status(422).json({ error: phoneNorm.error || "Invalid mobile number." });
    }

    const newE164 = phoneNorm.e164;

    // Verify phone is not already in use by another user
    const existing = await db.query.users.findFirst({
      where: and(
        or(eq(users.phoneE164, newE164), eq(users.phone, newE164)),
        sql`${users.id} != ${session.userId}`
      ),
    });

    if (existing) {
      return res.status(409).json({ error: "This phone number is already registered to another account." });
    }

    // Verify number is registered on WhatsApp
    const waCheck = await checkNumberOnWhatsApp(newE164);
    if (!waCheck.exists) {
      return res.status(422).json({
        error: "This phone number is not registered on WhatsApp. WashFlow requires an active WhatsApp account.",
      });
    }

    const clientIp = getClientIp(req);
    const otpResult = await createAndStoreOtp({
      e164Phone: newE164,
      purpose: "phone_change",
      clientIp,
      sessionBindingId: session.userId,
    });

    if (!otpResult.success) {
      return res.status(429).json({ error: otpResult.error });
    }

    return res.json({
      success: true,
      message: `Verification code sent to WhatsApp: ${newE164.slice(0, 5)}***${newE164.slice(-3)}`,
      retryAfter: otpResult.retryAfterSeconds || 60,
    });
  } catch (error) {
    console.error("Phone change OTP request error:", error);
    return res.status(500).json({ error: "Failed to dispatch verification code." });
  }
});

// Change Phone Number: Step 2 (Verify OTP and update)
const phoneVerifySchema = z.object({
  newPhone: z.string().min(5).max(30),
  code: z.string().length(6),
});

router.post("/profile/phone/verify-otp", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = phoneVerifySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Please enter the 6-digit verification code." });
    }

    const phoneNorm = normalizePhoneNumber(parse.data.newPhone);
    if (!phoneNorm.valid || !phoneNorm.e164) {
      return res.status(422).json({ error: "Invalid mobile number." });
    }

    const newE164 = phoneNorm.e164;

    const result = await verifyAndConsumeOtp({
      e164Phone: newE164,
      code: parse.data.code,
      purpose: "phone_change",
      sessionBindingId: session.userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || "Invalid verification code." });
    }

    // Update user record
    await db
      .update(users)
      .set({
        phone: newE164,
        phoneE164: newE164,
        phoneVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return res.json({
      success: true,
      message: "Phone number updated successfully.",
      newPhone: newE164,
    });
  } catch (error) {
    console.error("Phone change verify error:", error);
    return res.status(500).json({ error: "Verification failed." });
  }
});

// Update WhatsApp Notification Preference
router.patch("/profile/notifications", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { whatsappNotifications } = req.body;

    if (typeof whatsappNotifications !== "boolean") {
      return res.status(400).json({ error: "whatsappNotifications must be a boolean." });
    }

    await db
      .update(users)
      .set({
        whatsappNotifications,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    return res.json({ success: true, whatsappNotifications });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update notification settings." });
  }
});

// GDPR / DPA Data Export
router.get("/profile/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    const [user, userBookings, userAddresses, userPayments, userVouchers, userReferrals] =
      await Promise.all([
        db.query.users.findFirst({ where: eq(users.id, session.userId) }),
        db.query.bookings.findMany({
          where: eq(bookings.customerId, session.userId),
          with: { items: true, rating: true },
        }),
        db.query.addresses.findMany({ where: eq(addresses.userId, session.userId) }),
        db
          .select()
          .from(payments)
          .innerJoin(bookings, eq(payments.bookingId, bookings.id))
          .where(eq(bookings.customerId, session.userId)),
        db.query.vouchers.findMany({ where: eq(vouchers.clientId, session.userId) }),
        db.query.referrals.findMany({ where: eq(referrals.referrerId, session.userId) }),
      ]);

    const exportArchive = {
      exportedAt: new Date().toISOString(),
      platform: "WashFlow Kenya",
      clientProfile: {
        id: user?.id,
        name: user?.name,
        username: user?.username,
        email: user?.email,
        phone: user?.phone,
        joinedAt: user?.createdAt,
      },
      orders: userBookings,
      savedAddresses: userAddresses,
      payments: userPayments.map((p) => p.payments),
      vouchers: userVouchers,
      referralHistory: userReferrals,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="washflow-data-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return res.send(JSON.stringify(exportArchive, null, 2));
  } catch (error) {
    console.error("Data export error:", error);
    return res.status(500).json({ error: "Failed to export data." });
  }
});

// Account Deletion / Anonymization
router.post("/profile/delete", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    // Anonymize user record
    await db
      .update(users)
      .set({
        name: "Former Client",
        username: `deleted_${session.userId.slice(0, 8)}`,
        email: null,
        phone: null,
        phoneE164: null,
        passwordHash: null,
        googleSub: null,
        isBlocked: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.userId));

    // Revoke all sessions
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, session.userId));

    // Clear session cookies
    clearSessionCookie(res);

    return res.json({
      success: true,
      message: "Account has been anonymized and all sessions terminated.",
    });
  } catch (error) {
    console.error("Account delete error:", error);
    return res.status(500).json({ error: "Failed to process account deletion." });
  }
});

// Notifications Read Operations
router.post("/notifications/:id/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const notificationId = req.params.id;

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, session.userId)));

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to update notification." });
  }
});

router.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, session.userId));

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to mark all as read." });
  }
});

export default router;
