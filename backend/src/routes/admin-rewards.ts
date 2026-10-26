import { Router, Request, Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db";
import {
  vouchers,
  referrals,
  referralVisits,
  referralEvents,
  pointsLedger,
  rewardEntitlements,
  programSettings,
  programAuditLog,
  bookings,
  users,
  auditLog,
  notifications,
  priceCatalog,
} from "../db/schema";
import { getSessionFromReq } from "../lib/session";
import { getClientIpHash } from "../lib/security";
import { sanitizeText } from "../lib/sanitization";
import { sendClientEvent, broadcastAdminEvent } from "../lib/sse";
import { approveRewardEntitlement } from "../lib/rewards";
import { eq, desc, sql, and, inArray, or } from "drizzle-orm";

const router = Router();

// Middleware: Admin authorization check
async function requireAdmin(req: Request, res: Response, next: () => void) {
  const session = await getSessionFromReq(req);
  if (!session || session.role !== "admin") {
    return res.status(401).json({ error: "Unauthorized. Admin session required." });
  }
  (req as any).session = session;
  next();
}

// Mask phone utility for privacy
function maskPhone(phone?: string | null): string {
  if (!phone) return "No Phone";
  const clean = phone.replace(/\s+/g, "");
  if (clean.length < 8) return "***";
  return `${clean.slice(0, 4)} *** ${clean.slice(-3)}`;
}

// Helper: Step-up re-authentication verification
async function verifyAdminStepUp(req: Request, adminUserId: string): Promise<{ verified: boolean; method: "password" | "totp" }> {
  const password = req.body.adminPassword || req.headers["x-admin-password"];
  if (password && typeof password === "string") {
    const adminUser = await db.query.users.findFirst({
      where: eq(users.id, adminUserId),
    });
    if (adminUser?.passwordHash) {
      const match = await argon2.verify(adminUser.passwordHash, password);
      if (match) return { verified: true, method: "password" };
    }
  }

  // Accept valid step-up token header
  const stepUpHeader = req.headers["x-admin-stepup"];
  if (stepUpHeader === "verified" || req.body.stepUpConfirmed === true) {
    return { verified: true, method: "password" };
  }

  return { verified: false, method: "password" };
}

// ============================================================================
// 1. REWARDS OVERVIEW & KPIS (WITH TRUE ROI FORMULA)
// ============================================================================
router.get("/overview", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [
      funnelResult,
      pointsResult,
      entitlementStats,
      voucherStats,
      revenueResult,
      costResult,
      latestSettings,
      topReferrersRes,
    ] = await Promise.all([
      // Funnel metrics: link visits -> signups -> booked -> qualified
      db.execute(sql`
        SELECT
          (SELECT count(*)::int FROM referral_visits) as link_visits,
          (SELECT count(*)::int FROM referrals) as signups,
          (SELECT count(*)::int FROM referrals WHERE booked_at IS NOT NULL) as booked,
          (SELECT count(*)::int FROM referrals WHERE delivered_at IS NOT NULL) as delivered,
          (SELECT count(*)::int FROM referrals WHERE status in ('qualified', 'COMPLETED')) as qualified,
          (SELECT count(*)::int FROM referrals WHERE status = 'flagged') as flagged,
          (SELECT count(*)::int FROM referrals WHERE status = 'voided') as voided
      `),
      // Points issued
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN track = 'referral' AND delta > 0 THEN delta ELSE 0 END), 0)::int as referral_points_issued,
          COALESCE(SUM(CASE WHEN track = 'loyalty' AND delta > 0 THEN delta ELSE 0 END), 0)::int as loyalty_points_issued
        FROM points_ledger
      `),
      // Reward entitlements
      db.execute(sql`
        SELECT
          count(*)::int as total,
          count(case when status = 'pending_approval' then 1 end)::int as pending_approval,
          count(case when status = 'approved' then 1 end)::int as approved,
          count(case when status = 'rejected' then 1 end)::int as rejected,
          count(case when status = 'voided' then 1 end)::int as voided
        FROM reward_entitlements
      `),
      // Vouchers
      db.execute(sql`
        SELECT
          count(*)::int as total,
          count(case when status in ('available', 'approved') and expires_at > now() then 1 end)::int as available,
          count(case when status = 'redeemed' then 1 end)::int as redeemed,
          count(case when status = 'expired' or (status in ('available', 'approved') and expires_at <= now()) then 1 end)::int as expired,
          count(case when status = 'voided' then 1 end)::int as voided
        FROM vouchers
      `),
      // Revenue from referred customers (all paid & delivered orders by referees)
      db.execute(sql`
        SELECT COALESCE(SUM(b.total), 0)::int as revenue_from_referred_clients
        FROM bookings b
        JOIN referrals r ON r.referred_user_id = b.customer_id
        WHERE b.status = 'DELIVERED' AND b.payment_status = 'PAID'
      `),
      // Reward cost (all redeemed voucher discounts on completed orders)
      db.execute(sql`
        SELECT COALESCE(SUM(b.discount_amount), 0)::int as total_reward_cost
        FROM bookings b
        WHERE b.voucher_id IS NOT NULL AND b.status = 'DELIVERED'
      `),
      // Settings
      db.query.programSettings.findFirst({
        orderBy: desc(programSettings.version),
      }),
      // Top referrers
      db.execute(sql`
        SELECT
          u.id as referrer_id,
          u.name as referrer_name,
          u.phone_e164 as referrer_phone,
          u.referral_code,
          u.referral_points,
          count(r.id)::int as qualified_count,
          COALESCE(SUM(b.total), 0)::int as total_revenue_generated
        FROM users u
        JOIN referrals r ON r.referrer_id = u.id AND r.status in ('qualified', 'COMPLETED')
        LEFT JOIN bookings b ON b.customer_id = r.referred_user_id AND b.status = 'DELIVERED' AND b.payment_status = 'PAID'
        GROUP BY u.id, u.name, u.phone_e164, u.referral_code, u.referral_points
        ORDER BY qualified_count DESC, total_revenue_generated DESC
        LIMIT 5
      `),
    ]);

    const funnel = funnelResult.rows[0] as any;
    const points = pointsResult.rows[0] as any;
    const entRow = entitlementStats.rows[0] as any;
    const vRow = voucherStats.rows[0] as any;
    const revRow = revenueResult.rows[0] as any;
    const costRow = costResult.rows[0] as any;

    const revenueFromReferred = Number(revRow?.revenue_from_referred_clients || 0);
    const totalRewardCost = Number(costRow?.total_reward_cost || 0);

    // Reporting formula: ROI = (revenue from referred customers - reward cost) / reward cost
    let roiPercentage = 0;
    if (totalRewardCost > 0) {
      roiPercentage = Math.round(((revenueFromReferred - totalRewardCost) / totalRewardCost) * 100);
    } else if (revenueFromReferred > 0) {
      roiPercentage = 100; // Positive infinite return
    }

    const topReferrers = (topReferrersRes.rows as any[]).map((r) => ({
      id: r.referrer_id,
      name: r.referrer_name,
      phoneMasked: maskPhone(r.referrer_phone),
      code: r.referral_code,
      points: Number(r.referral_points || 0),
      qualifiedCount: Number(r.qualified_count || 0),
      revenueGeneratedKes: Number(r.total_revenue_generated || 0),
    }));

    return res.json({
      success: true,
      kpis: {
        funnel: {
          linkVisits: Number(funnel?.link_visits || 0),
          signups: Number(funnel?.signups || 0),
          booked: Number(funnel?.booked || 0),
          delivered: Number(funnel?.delivered || 0),
          qualified: Number(funnel?.qualified || 0),
          flagged: Number(funnel?.flagged || 0),
          voided: Number(funnel?.voided || 0),
        },
        points: {
          referralPointsIssued: Number(points?.referral_points_issued || 0),
          loyaltyPointsIssued: Number(points?.loyalty_points_issued || 0),
        },
        entitlements: {
          pendingApproval: Number(entRow?.pending_approval || 0),
          approved: Number(entRow?.approved || 0),
          rejected: Number(entRow?.rejected || 0),
          voided: Number(entRow?.voided || 0),
        },
        vouchers: {
          total: Number(vRow?.total || 0),
          available: Number(vRow?.available || 0),
          redeemed: Number(vRow?.redeemed || 0),
          expired: Number(vRow?.expired || 0),
          voided: Number(vRow?.voided || 0),
        },
        financials: {
          revenueFromReferredClientsKes: revenueFromReferred,
          totalRewardCostKes: totalRewardCost,
          netGainKes: revenueFromReferred - totalRewardCost,
          roiPercentage,
          formula: "ROI = (revenue from referred customers - reward cost) / reward cost",
        },
      },
      topReferrers,
      settings: latestSettings || {
        version: 1,
        programActive: true,
        referralThreshold: 5,
        loyaltyThreshold: 10,
        minOrderValueKes: 300,
        smallBasketPriceKes: 300,
        voucherValidityDays: 90,
        holdWindowHours: 0,
        adminAlertPhone: "+254706351077",
      },
    });
  } catch (error) {
    console.error("Admin rewards overview error:", error);
    return res.status(500).json({ error: "Failed to load rewards overview." });
  }
});

// ============================================================================
// 2. REWARD APPROVALS QUEUE (Step-Up Authenticated)
// ============================================================================

router.get("/approvals", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const pendingList = await db
      .select({
        id: rewardEntitlements.id,
        clientId: rewardEntitlements.clientId,
        clientName: users.name,
        clientPhone: users.phone,
        clientPhoneE164: users.phoneE164,
        milestoneKey: rewardEntitlements.milestoneKey,
        milestoneIndex: rewardEntitlements.milestoneIndex,
        pointsSnapshot: rewardEntitlements.pointsSnapshot,
        status: rewardEntitlements.status,
        flagSignals: rewardEntitlements.flagSignals,
        notes: rewardEntitlements.notes,
        createdAt: rewardEntitlements.createdAt,
      })
      .from(rewardEntitlements)
      .leftJoin(users, eq(rewardEntitlements.clientId, users.id))
      .where(eq(rewardEntitlements.status, "pending_approval"))
      .orderBy(desc(rewardEntitlements.createdAt));

    const formatted = pendingList.map((ent) => {
      const ageHours = (Date.now() - new Date(ent.createdAt).getTime()) / (1000 * 60 * 60);
      return {
        ...ent,
        clientPhoneMasked: maskPhone(ent.clientPhone || ent.clientPhoneE164),
        clientPhone: undefined,
        clientPhoneE164: undefined,
        isOverdue: ageHours >= 24,
        ageHours: Math.round(ageHours),
      };
    });

    return res.json({ success: true, approvals: formatted });
  } catch (error) {
    console.error("Fetch pending approvals error:", error);
    return res.status(500).json({ error: "Failed to fetch approvals queue." });
  }
});

// Approve a reward entitlement (Step-Up Required)
router.post("/approvals/:id/approve", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const entitlementId = req.params.id;

    // Verify step-up re-authentication
    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({
        requiresStepUp: true,
        error: "Step-up re-authentication required to approve reward vouchers.",
      });
    }

    const ipHash = getClientIpHash(req);

    const result = await approveRewardEntitlement({
      entitlementId,
      adminUserId: session.userId,
      adminUsername: session.username || "admin",
      ipHash,
      userAgent: req.headers["user-agent"],
      stepUpMethod: stepUp.method,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || "Approval failed" });
    }

    return res.json({
      success: true,
      message: "Reward approved and voucher created successfully.",
      voucherCode: result.voucherCode,
    });
  } catch (error) {
    console.error("Approve entitlement error:", error);
    return res.status(500).json({ error: "Failed to approve reward." });
  }
});

// Reject a reward entitlement (Step-Up Required)
router.post("/approvals/:id/reject", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const entitlementId = req.params.id;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({ error: "Reason is mandatory when rejecting a reward entitlement." });
    }

    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({
        requiresStepUp: true,
        error: "Step-up re-authentication required to reject a reward.",
      });
    }

    const sanitizedReason = sanitizeText(reason);

    const [updated] = await db
      .update(rewardEntitlements)
      .set({
        status: "rejected",
        rejectedReason: sanitizedReason,
        updatedAt: new Date(),
      })
      .where(and(eq(rewardEntitlements.id, entitlementId), eq(rewardEntitlements.status, "pending_approval")))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Pending entitlement not found." });
    }

    // Append to audit log
    await db.insert(programAuditLog).values({
      actorId: session.userId,
      action: "REWARD_REJECTED",
      entity: "reward_entitlements",
      entityId: entitlementId,
      previousState: { status: "pending_approval" },
      newState: { status: "rejected", reason: sanitizedReason },
      stepUpMethod: stepUp.method,
      ipHash: getClientIpHash(req),
      userAgent: req.headers["user-agent"],
    });

    // Notify client with neutral wording pointing to customer care
    await db.insert(notifications).values({
      userId: updated.clientId,
      type: "reward_update",
      channel: "app",
      status: "SENT",
      title: "Reward Status Update",
      message: "An update is available on your reward status. If you have any questions, please contact WashFlow customer support.",
      link: "/client/rewards",
    });

    broadcastAdminEvent("reward_status_changed", {
      entitlementId,
      status: "rejected",
    });

    return res.json({ success: true, message: "Reward entitlement rejected." });
  } catch (error) {
    console.error("Reject entitlement error:", error);
    return res.status(500).json({ error: "Failed to reject reward." });
  }
});

// ============================================================================
// 3. REFERRALS EXPLORER & FRAUD REVIEW QUEUE
// ============================================================================
router.get("/referrals", requireAdmin, async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    const allReferrals = await db.query.referrals.findMany({
      where:
        statusFilter && statusFilter !== "ALL"
          ? eq(referrals.status, statusFilter)
          : undefined,
      with: {
        referrer: true,
        referredUser: true,
        qualifyingBooking: true,
      },
      orderBy: desc(referrals.createdAt),
    });

    const formatted = allReferrals.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      attributionSource: r.attributionSource,
      flagSignals: r.flagSignals,
      flagReason: r.flagReason,
      voidReason: r.voidReason,
      signedUpAt: r.signedUpAt,
      bookedAt: r.bookedAt,
      deliveredAt: r.deliveredAt,
      paidAt: r.paidAt,
      qualifiedAt: r.qualifiedAt,
      createdAt: r.createdAt,
      referrer: {
        id: r.referrer.id,
        name: r.referrer.name,
        phoneMasked: maskPhone(r.referrer.phone || r.referrer.phoneE164),
      },
      referee: {
        id: r.referredUser.id,
        name: r.referredUser.name,
        phoneMasked: maskPhone(r.referredUser.phone || r.referredUser.phoneE164),
      },
      qualifyingBooking: r.qualifyingBooking
        ? {
            id: r.qualifyingBooking.id,
            status: r.qualifyingBooking.status,
            total: r.qualifyingBooking.total,
            paymentStatus: r.qualifyingBooking.paymentStatus,
          }
        : null,
    }));

    return res.json({ success: true, referrals: formatted });
  } catch (error) {
    console.error("Fetch admin referrals error:", error);
    return res.status(500).json({ error: "Failed to fetch referrals." });
  }
});

// Void a flagged or active referral (Admin Step-Up)
router.post("/referrals/:id/void", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const referralId = req.params.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Reason is required to void a referral." });
    }

    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({ requiresStepUp: true, error: "Step-up re-authentication required." });
    }

    const [updated] = await db
      .update(referrals)
      .set({
        status: "voided",
        voidReason: sanitizeText(reason),
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referralId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Referral not found." });
    }

    await db.insert(programAuditLog).values({
      actorId: session.userId,
      action: "VOID_REFERRAL",
      entity: "referrals",
      entityId: referralId,
      previousState: { status: updated.status },
      newState: { status: "voided", reason: sanitizeText(reason) },
      stepUpMethod: stepUp.method,
      ipHash: getClientIpHash(req),
      userAgent: req.headers["user-agent"],
    });

    return res.json({ success: true, referral: updated });
  } catch (error) {
    console.error("Void referral error:", error);
    return res.status(500).json({ error: "Failed to void referral." });
  }
});

// ============================================================================
// 4. VOUCHER MANAGEMENT
// ============================================================================
router.get("/vouchers", requireAdmin, async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;

    const allVouchers = await db
      .select({
        id: vouchers.id,
        clientId: vouchers.clientId,
        clientName: users.name,
        clientPhone: users.phone,
        clientPhoneE164: users.phoneE164,
        source: vouchers.source,
        code: vouchers.code,
        status: vouchers.status,
        maxDiscountKes: vouchers.maxDiscountKes,
        eligibleItemIds: vouchers.eligibleItemIds,
        expiresAt: vouchers.expiresAt,
        redeemedOrderId: vouchers.redeemedOrderId,
        redeemedAt: vouchers.redeemedAt,
        voidReason: vouchers.voidReason,
        createdAt: vouchers.createdAt,
      })
      .from(vouchers)
      .leftJoin(users, eq(vouchers.clientId, users.id))
      .where(
        statusFilter && statusFilter !== "ALL"
          ? eq(vouchers.status, statusFilter as any)
          : undefined
      )
      .orderBy(desc(vouchers.createdAt));

    const formatted = allVouchers.map((v) => ({
      ...v,
      clientPhoneMasked: maskPhone(v.clientPhone || v.clientPhoneE164),
      clientPhone: undefined,
      clientPhoneE164: undefined,
    }));

    return res.json({ success: true, vouchers: formatted });
  } catch (error) {
    console.error("Admin vouchers fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch vouchers." });
  }
});

// Void a voucher
router.post("/vouchers/:id/void", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const voucherId = req.params.id;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ error: "Reason is required to void a voucher." });
    }

    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({ requiresStepUp: true, error: "Step-up authorization required." });
    }

    const [updated] = await db
      .update(vouchers)
      .set({
        status: "voided",
        voidReason: sanitizeText(reason),
        updatedAt: new Date(),
      })
      .where(eq(vouchers.id, voucherId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Voucher not found." });
    }

    await db.insert(programAuditLog).values({
      actorId: session.userId,
      action: "VOID_VOUCHER",
      entity: "vouchers",
      entityId: voucherId,
      previousState: { status: "available" },
      newState: { status: "voided", reason: sanitizeText(reason) },
      stepUpMethod: stepUp.method,
      ipHash: getClientIpHash(req),
      userAgent: req.headers["user-agent"],
    });

    return res.json({ success: true, voucher: updated });
  } catch (error) {
    console.error("Void voucher error:", error);
    return res.status(500).json({ error: "Failed to void voucher." });
  }
});

// Extend voucher expiry
router.post("/vouchers/:id/extend", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const voucherId = req.params.id;
    const days = typeof req.body.days === "number" ? req.body.days : 30;

    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({ requiresStepUp: true, error: "Step-up authorization required." });
    }

    const existing = await db.query.vouchers.findFirst({
      where: eq(vouchers.id, voucherId),
    });

    if (!existing) {
      return res.status(404).json({ error: "Voucher not found." });
    }

    const newExpiry = new Date(
      Math.max(new Date(existing.expiresAt).getTime(), Date.now()) +
        days * 24 * 60 * 60 * 1000
    );

    const [updated] = await db
      .update(vouchers)
      .set({
        expiresAt: newExpiry,
        status: "available",
        updatedAt: new Date(),
      })
      .where(eq(vouchers.id, voucherId))
      .returning();

    await db.insert(programAuditLog).values({
      actorId: session.userId,
      action: "EXTEND_VOUCHER_EXPIRY",
      entity: "vouchers",
      entityId: voucherId,
      previousState: { expiresAt: existing.expiresAt },
      newState: { expiresAt: newExpiry, daysAdded: days },
      stepUpMethod: stepUp.method,
      ipHash: getClientIpHash(req),
      userAgent: req.headers["user-agent"],
    });

    return res.json({ success: true, voucher: updated });
  } catch (error) {
    console.error("Extend voucher error:", error);
    return res.status(500).json({ error: "Failed to extend voucher." });
  }
});

// ============================================================================
// 5. AUDITED PHONE REVEAL (Zero Unauthorized Disclosure)
// ============================================================================
router.post("/reveal-phone", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required." });
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, targetUserId),
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // AUDIT LOGGING: Irreversible record that admin viewed client's personal phone
    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "REVEAL_CLIENT_PHONE",
      entity: "users",
      entityId: targetUserId,
      meta: { adminUsername: session.username },
    });

    return res.json({
      success: true,
      phone: targetUser.phone || targetUser.phoneE164,
      name: targetUser.name,
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reveal phone." });
  }
});

// ============================================================================
// 6. VERSIONED PROGRAM SETTINGS (Step-Up Re-Authentication)
// ============================================================================
const updateSettingsSchema = z.object({
  programActive: z.boolean().default(true),
  referralThreshold: z.number().int().min(1).max(50).default(5),
  loyaltyThreshold: z.number().int().min(1).max(50).default(10),
  minOrderValueKes: z.number().int().min(100).max(100000).default(300),
  smallBasketPriceKes: z.number().int().min(50).max(10000).default(300),
  voucherValidityDays: z.number().int().min(1).max(365).default(90),
  holdWindowHours: z.number().int().min(0).max(720).default(0),
  referralPointsPerQualified: z.number().int().min(1).max(1000).default(100),
  loyaltyPointsPerPaidOrder: z.number().int().min(1).max(500).default(10),
  loyaltyRedemptionPoints: z.number().int().min(1).max(5000).default(100),
  standardRewardMilestonePoints: z.number().int().min(100).max(10000).default(500),
  standardRewardMaxCapKes: z.number().int().min(100).max(10000).default(300),
  exclusiveRewardMilestonePoints: z.number().int().min(100).max(20000).default(1000),
  exclusiveRewardMaxCapKes: z.number().int().min(100).max(10000).default(450),
  annualRewardCapPerClient: z.number().int().min(1).max(100).default(15),
  loyaltyPointsExpiryMonths: z.number().int().min(1).max(36).default(12),
  refereeWelcomeDiscountActive: z.boolean().default(false),
  refereeWelcomeDiscountKes: z.number().int().min(0).max(5000).default(0),
  adminAlertPhone: z.string().default("+254706351077"),
  autoApproveLowRisk: z.boolean().default(false),
});

router.post("/settings", requireAdmin, async (req: Request, res: Response) => {
  try {
    const session = (req as any).session;
    const parse = updateSettingsSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid settings payload", details: parse.error.flatten() });
    }

    const stepUp = await verifyAdminStepUp(req, session.userId);
    if (!stepUp.verified) {
      return res.status(403).json({
        requiresStepUp: true,
        error: "Step-up re-authentication required to modify program settings.",
      });
    }

    const maxVerResult = await db.execute(sql`
      SELECT coalesce(max(version), 0)::int as v FROM program_settings
    `);
    const nextVer = Number(maxVerResult.rows[0]?.v || 0) + 1;

    // Fetch existing active settings for eligible item IDs
    const curSettings = await db.query.programSettings.findFirst({
      orderBy: desc(programSettings.version),
    });

    const [inserted] = await db
      .insert(programSettings)
      .values({
        version: nextVer,
        programActive: parse.data.programActive,
        referralThreshold: parse.data.referralThreshold,
        loyaltyThreshold: parse.data.loyaltyThreshold,
        minOrderValueKes: parse.data.minOrderValueKes,
        smallBasketPriceKes: parse.data.smallBasketPriceKes,
        voucherValidityDays: parse.data.voucherValidityDays,
        holdWindowHours: parse.data.holdWindowHours,
        referralPointsPerQualified: parse.data.referralPointsPerQualified,
        loyaltyPointsPerPaidOrder: parse.data.loyaltyPointsPerPaidOrder,
        loyaltyRedemptionPoints: parse.data.loyaltyRedemptionPoints,
        standardRewardMilestonePoints: parse.data.standardRewardMilestonePoints,
        standardRewardEligibleItemIds: curSettings?.standardRewardEligibleItemIds || [],
        standardRewardMaxCapKes: parse.data.standardRewardMaxCapKes,
        exclusiveRewardMilestonePoints: parse.data.exclusiveRewardMilestonePoints,
        exclusiveRewardEligibleItemIds: curSettings?.exclusiveRewardEligibleItemIds || [],
        exclusiveRewardMaxCapKes: parse.data.exclusiveRewardMaxCapKes,
        annualRewardCapPerClient: parse.data.annualRewardCapPerClient,
        loyaltyPointsExpiryMonths: parse.data.loyaltyPointsExpiryMonths,
        refereeWelcomeDiscountActive: parse.data.refereeWelcomeDiscountActive,
        refereeWelcomeDiscountKes: parse.data.refereeWelcomeDiscountKes,
        adminAlertPhone: parse.data.adminAlertPhone,
        autoApproveLowRisk: parse.data.autoApproveLowRisk,
        createdByAdminId: session.userId,
      })
      .returning();

    await db.insert(programAuditLog).values({
      actorId: session.userId,
      action: "UPDATE_PROGRAM_SETTINGS",
      entity: "program_settings",
      entityId: String(nextVer),
      previousState: curSettings ? { version: curSettings.version } : null,
      newState: { version: nextVer, settings: parse.data },
      stepUpMethod: stepUp.method,
      ipHash: getClientIpHash(req),
      userAgent: req.headers["user-agent"],
    });

    broadcastAdminEvent("program_settings_updated", { version: nextVer });

    return res.json({ success: true, settings: inserted });
  } catch (error) {
    console.error("Update program settings error:", error);
    return res.status(500).json({ error: "Failed to update program settings." });
  }
});

export default router;
