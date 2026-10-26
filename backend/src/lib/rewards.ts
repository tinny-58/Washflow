import crypto from "crypto";
import { db, pool } from "../db";
import {
  users,
  referralCodes,
  referralVisits,
  referrals,
  referralEvents,
  pointsLedger,
  rewardEntitlements,
  vouchers,
  programSettings,
  programAuditLog,
  bookings,
  bookingItems,
  payments,
  notifications,
  priceCatalog,
} from "../db/schema";
import { eq, and, desc, sql, inArray, or } from "drizzle-orm";
import { env } from "./env";
import { broadcastAdminEvent, sendClientEvent } from "./sse";
import { sanitizeText } from "./sanitization";

// ============================================================================
// 1. CSPRNG UNGUESSABLE REFERRAL CODE GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure, unguessable, human-friendly code.
 * Format: "WF-" + 6 alphanumeric characters (base32 Crockford-safe, avoiding confusing chars 0/O, 1/I/L)
 * Example: "WF-7K9P2X" (~1 billion unique combinations)
 */
export function generateCsprngCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = crypto.randomBytes(6);
  let code = "WF-";
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

/**
 * Generate or retrieve the authoritative referral code for a user
 */
export async function getOrCreateUserReferralCode(userId: string): Promise<string> {
  const existing = await db.query.referralCodes.findFirst({
    where: and(eq(referralCodes.userId, userId), eq(referralCodes.active, true)),
  });

  if (existing) {
    return existing.code;
  }

  // Generate a collision-free code
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateCsprngCode();
    try {
      const [inserted] = await db
        .insert(referralCodes)
        .values({
          userId,
          code: candidate,
          active: true,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        await db
          .update(users)
          .set({ referralCode: candidate })
          .where(eq(users.id, userId));

        return candidate;
      }
    } catch (err) {
      // Retry on unique collision
    }
  }

  // Fallback if collision
  const fallback = `WF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  await db.insert(referralCodes).values({ userId, code: fallback, active: true });
  await db.update(users).set({ referralCode: fallback }).where(eq(users.id, userId));
  return fallback;
}

// ============================================================================
// 2. SIGNED ATTRIBUTION COOKIE (First-Touch Wins, Tamper-Proof)
// ============================================================================

const ATTRIBUTION_COOKIE_SECRET = env.SESSION_SECRET || "washflow_attribution_secret_key_32b_prod";

export function signAttributionCookie(code: string): string {
  const timestamp = Date.now().toString();
  const payload = `${code.trim().toUpperCase()}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", ATTRIBUTION_COOKIE_SECRET).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

export function verifyAttributionCookie(cookieVal?: string | null): string | null {
  if (!cookieVal || typeof cookieVal !== "string") return null;
  const parts = cookieVal.split(":");
  if (parts.length !== 3) return null;

  const [code, timestamp, signature] = parts;
  const payload = `${code}:${timestamp}`;
  const expectedHmac = crypto.createHmac("sha256", ATTRIBUTION_COOKIE_SECRET).update(payload).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedHmac))) {
    return null;
  }

  // Check cookie lifetime (e.g. 60 days)
  const ageMs = Date.now() - parseInt(timestamp, 10);
  if (isNaN(ageMs) || ageMs < 0 || ageMs > 60 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return code.toUpperCase();
}

/**
 * Record a privacy-safe referral link visit (aggregated, zero raw IP)
 */
export async function recordReferralVisit(params: {
  code: string;
  visitorHash: string;
  deviceClass?: string;
  landingPath?: string;
}): Promise<void> {
  const { code, visitorHash, deviceClass, landingPath } = params;
  const cleanCode = code.trim().toUpperCase();

  await db
    .insert(referralVisits)
    .values({
      code: cleanCode,
      visitorHash,
      deviceClass: deviceClass || "desktop",
      landingPath: landingPath || `/r/${cleanCode}`,
      converted: false,
    })
    .catch(() => {});
}

/**
 * Public referral code validator (Anti-enumeration: returns only { valid: boolean })
 */
export async function validateReferralCodeLookup(rawCode?: string | null): Promise<{ valid: boolean }> {
  if (!rawCode || typeof rawCode !== "string") return { valid: false };
  const clean = rawCode.trim().toUpperCase();
  if (clean.length < 5 || clean.length > 20) return { valid: false };

  const found = await db.query.referralCodes.findFirst({
    where: and(eq(referralCodes.code, clean), eq(referralCodes.active, true)),
  });

  return { valid: Boolean(found) };
}

// ============================================================================
// 3. ATTRIBUTION ON SIGNUP (Strictly Server-Side, Atomic)
// ============================================================================

export async function attributeReferralOnSignup(params: {
  refereeUserId: string;
  refereePhoneE164?: string | null;
  refereeEmail?: string | null;
  rawCode?: string | null;
  visitorHash?: string | null;
  deviceFingerprint?: string | null;
  attributionSource?: "link" | "manual_code" | "promo";
}): Promise<{ success: boolean; flagged?: boolean; message?: string }> {
  const {
    refereeUserId,
    refereePhoneE164,
    refereeEmail,
    rawCode,
    visitorHash,
    deviceFingerprint,
    attributionSource = "link",
  } = params;

  if (!rawCode || !rawCode.trim()) {
    return { success: false, message: "No code provided" };
  }

  const cleanCode = rawCode.trim().toUpperCase();

  // 1. Look up referrer code
  const codeRecord = await db.query.referralCodes.findFirst({
    where: and(eq(referralCodes.code, cleanCode), eq(referralCodes.active, true)),
  });

  let referrerId: string | null = codeRecord ? codeRecord.userId : null;

  // Fallback to users.referral_code
  if (!referrerId) {
    const userWithCode = await db.query.users.findFirst({
      where: sql`upper(${users.referralCode}) = ${cleanCode}`,
    });
    if (userWithCode) {
      referrerId = userWithCode.id;
    }
  }

  if (!referrerId) {
    return { success: false, message: "Referral code not found" };
  }

  // 2. Anti-self-referral
  if (referrerId === refereeUserId) {
    return { success: false, message: "Self-referral is not allowed" };
  }

  // 3. Referee must be unique (only first attribution ever counts)
  const existingReferral = await db.query.referrals.findFirst({
    where: eq(referrals.referredUserId, refereeUserId),
  });

  if (existingReferral) {
    return { success: false, message: "Referee already attributed" };
  }

  // 4. Fetch referrer details for fraud analysis
  const referrer = await db.query.users.findFirst({
    where: eq(users.id, referrerId),
  });

  if (!referrer) {
    return { success: false, message: "Referrer record missing" };
  }

  // 5. Fraud checks
  const flagSignals: Record<string, any> = {};
  let isFlagged = false;

  // Hard reject / Flag: Same phone number
  if (
    refereePhoneE164 &&
    referrer.phoneE164 &&
    refereePhoneE164.trim() === referrer.phoneE164.trim()
  ) {
    isFlagged = true;
    flagSignals.samePhone = true;
  }

  // Hard reject / Flag: Same email
  if (
    refereeEmail &&
    referrer.email &&
    refereeEmail.trim().toLowerCase() === referrer.email.trim().toLowerCase()
  ) {
    isFlagged = true;
    flagSignals.sameEmail = true;
  }

  // Soft flag: Same device fingerprint
  if (
    deviceFingerprint &&
    referrer.deviceFingerprint &&
    deviceFingerprint === referrer.deviceFingerprint
  ) {
    isFlagged = true;
    flagSignals.sameDevice = true;
  }

  // Soft flag: Referral ring check (Did referee already refer referrer?)
  const reverseReferral = await db.query.referrals.findFirst({
    where: and(
      eq(referrals.referrerId, refereeUserId),
      eq(referrals.referredUserId, referrerId)
    ),
  });

  if (reverseReferral) {
    isFlagged = true;
    flagSignals.referralRing = true;
  }

  // Soft flag: Velocity limit (>10 signups in 1 hour on this code)
  const recentSignups = await db.execute(sql`
    SELECT count(*)::int as c FROM referrals
    WHERE referrer_id = ${referrerId} AND created_at > (NOW() - INTERVAL '1 hour')
  `);
  const recentCount = Number(recentSignups.rows[0]?.c || 0);
  if (recentCount >= 10) {
    isFlagged = true;
    flagSignals.velocityExceeded = true;
  }

  const initialStatus = isFlagged ? "flagged" : "signed_up";
  const flagReason = isFlagged
    ? Object.keys(flagSignals).join(", ")
    : null;

  // 6. Insert authoritative referral record
  const [createdRef] = await db
    .insert(referrals)
    .values({
      referrerId,
      referredUserId: refereeUserId,
      code: cleanCode,
      status: initialStatus,
      attributionSource,
      flagSignals: isFlagged ? flagSignals : null,
      flagReason,
      signedUpAt: new Date(),
    })
    .returning();

  // 7. Record referral event
  await db.insert(referralEvents).values({
    referralId: createdRef.id,
    eventType: "signed_up",
    notes: isFlagged
      ? `Registration flagged for review: ${flagReason}`
      : `Signed up via referral code ${cleanCode}`,
    meta: { flagSignals: isFlagged ? flagSignals : null, attributionSource },
  });

  // Mark referral visits converted if matching
  if (visitorHash) {
    await db
      .update(referralVisits)
      .set({ converted: true })
      .where(and(eq(referralVisits.code, cleanCode), eq(referralVisits.visitorHash, visitorHash)))
      .catch(() => {});
  }

  // Update referred_by on user
  await db
    .update(users)
    .set({ referredBy: cleanCode })
    .where(eq(users.id, refereeUserId));

  // If flagged, notify admin for fraud review
  if (isFlagged) {
    broadcastAdminEvent("referral_flagged", {
      referralId: createdRef.id,
      code: cleanCode,
      reason: flagReason,
    });
  }

  return { success: true, flagged: isFlagged };
}

// ============================================================================
// 4. SERVER-SIDE QUALIFICATION & TRANSACTIONAL OUTBOX EVALUATION
// ============================================================================

export interface QualificationResult {
  qualified: boolean;
  awardedReferralPoints: number;
  awardedLoyaltyPoints: number;
  newMilestones: Array<{ key: string; index: number; points: number }>;
  flagged?: boolean;
  reason?: string;
}

/**
 * Authoritative, idempotent qualification engine.
 * Computes qualification strictly from validated order and payment records.
 * Can be called safely from either DELIVERED transition or M-Pesa callback.
 */
export async function evaluateOrderQualification(
  orderId: string,
  triggerSource: "status_delivered" | "payment_confirmed" = "status_delivered"
): Promise<QualificationResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Acquire PostgreSQL transaction-level advisory lock on the order to prevent concurrent race
    const lockRes = await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`qual_lock:${orderId}`]
    );

    // 1. Fetch authoritative booking
    const bookingRes = await client.query(
      `SELECT id, customer_id, status, payment_status, total, subtotal, discount_amount, address_id 
       FROM bookings WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (bookingRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { qualified: false, awardedReferralPoints: 0, awardedLoyaltyPoints: 0, newMilestones: [], reason: "Order not found" };
    }

    const order = bookingRes.rows[0];

    // Must be DELIVERED and PAID
    if (order.status !== "DELIVERED" || order.payment_status !== "PAID") {
      await client.query("ROLLBACK");
      return { qualified: false, awardedReferralPoints: 0, awardedLoyaltyPoints: 0, newMilestones: [], reason: "Order not delivered or not paid" };
    }

    // 2. Fetch authoritative active program settings
    const settingsRes = await client.query(
      `SELECT * FROM program_settings ORDER BY version DESC LIMIT 1`
    );
    const settings = settingsRes.rows[0] || {
      version: 1,
      program_active: true,
      min_order_value_kes: 300,
      referral_points_per_qualified: 100,
      loyalty_points_per_paid_order: 10,
      standard_reward_milestone_points: 500,
      exclusive_reward_milestone_points: 1000,
      admin_alert_phone: "+254706351077",
    };

    if (settings.program_active === false) {
      await client.query("ROLLBACK");
      return { qualified: false, awardedReferralPoints: 0, awardedLoyaltyPoints: 0, newMilestones: [], reason: "Program inactive" };
    }

    // 3. Check verified M-Pesa payment records (must be COMPLETED)
    const paymentRes = await client.query(
      `SELECT id, provider_ref, amount, status, raw_callback_json 
       FROM payments 
       WHERE booking_id = $1 AND status = 'COMPLETED' 
       ORDER BY created_at DESC LIMIT 1`,
      [orderId]
    );

    const isFullyPaid = order.total === 0 || paymentRes.rows.length > 0;
    if (!isFullyPaid) {
      await client.query("ROLLBACK");
      return { qualified: false, awardedReferralPoints: 0, awardedLoyaltyPoints: 0, newMilestones: [], reason: "Payment confirmation missing" };
    }

    // 4. AWARD LOYALTY POINTS (To the ordering customer)
    // Award 10 loyalty points for every booking that is delivered and paid.
    // Only on paid portion of an order (washes paid entirely with voucher earn 0).
    let awardedLoyaltyPoints = 0;
    const isEntirelyFreeWash = order.total === 0 && Number(order.discount_amount || 0) >= Number(order.subtotal || 0);

    if (!isEntirelyFreeWash) {
      const loyaltyEventId = `order_loyalty:${orderId}`;
      const loyaltyPointsToAward = Number(settings.loyalty_points_per_paid_order || 10);

      // Check if already awarded
      const existingLoyalty = await client.query(
        `SELECT id FROM points_ledger WHERE track = 'loyalty' AND source_event_id = $1`,
        [loyaltyEventId]
      );

      if (existingLoyalty.rows.length === 0) {
        // Calculate balance after
        const curLoyaltyBalRes = await client.query(
          `SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger WHERE client_id = $1 AND track = 'loyalty'`,
          [order.customer_id]
        );
        const newLoyaltyBal = Number(curLoyaltyBalRes.rows[0]?.bal || 0) + loyaltyPointsToAward;

        await client.query(
          `INSERT INTO points_ledger (client_id, track, delta, reason, order_id, source_event_id, balance_after)
           VALUES ($1, 'loyalty', $2, 'ORDER_DELIVERED_PAID', $3, $4, $5)
           ON CONFLICT (track, source_event_id) DO NOTHING`,
          [order.customer_id, loyaltyPointsToAward, orderId, loyaltyEventId, newLoyaltyBal]
        );

        // Update user cached balance
        await client.query(
          `UPDATE users SET loyalty_points = $1 WHERE id = $2`,
          [newLoyaltyBal, order.customer_id]
        );

        awardedLoyaltyPoints = loyaltyPointsToAward;

        // In-app notification
        await client.query(
          `INSERT INTO notifications (user_id, type, channel, status, title, message, link, booking_id)
           VALUES ($1, 'loyalty_reward', 'app', 'SENT', 'Loyalty Points Earned! 🧺', $2, '/client/rewards', $3)`,
          [
            order.customer_id,
            `You earned +${loyaltyPointsToAward} loyalty points for completed wash #${orderId.slice(0, 8)}.`,
            orderId,
          ]
        );

        sendClientEvent(order.customer_id, "points_updated", {
          track: "loyalty",
          balance: newLoyaltyBal,
          delta: loyaltyPointsToAward,
        });
      }
    }

    // 5. EVALUATE REFERRAL QUALIFICATION (For the referrer)
    // Check if the customer has an active referral
    const refRes = await client.query(
      `SELECT id, referrer_id, referred_user_id, status, code, flag_signals 
       FROM referrals 
       WHERE referred_user_id = $1 
       FOR UPDATE`,
      [order.customer_id]
    );

    if (refRes.rows.length === 0) {
      await client.query("COMMIT");
      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        reason: "Customer not referred",
      };
    }

    const referral = refRes.rows[0];

    // If already qualified or voided
    if (referral.status === "qualified" || referral.status === "COMPLETED") {
      await client.query("COMMIT");
      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        reason: "Referral already qualified",
      };
    }

    if (referral.status === "voided") {
      await client.query("COMMIT");
      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        reason: "Referral voided",
      };
    }

    // Check: Is this genuinely the referee's FIRST delivered & paid order?
    const previousOrdersRes = await client.query(
      `SELECT count(*)::int as c FROM bookings 
       WHERE customer_id = $1 AND status = 'DELIVERED' AND payment_status = 'PAID' AND id != $2`,
      [order.customer_id, orderId]
    );
    const priorDeliveredPaidCount = Number(previousOrdersRes.rows[0]?.c || 0);

    if (priorDeliveredPaidCount > 0) {
      // Not first order! Void qualification
      await client.query(
        `UPDATE referrals SET status = 'voided', void_reason = 'Not referee first completed order', updated_at = NOW() WHERE id = $1`,
        [referral.id]
      );
      await client.query("COMMIT");
      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        reason: "Not first order",
      };
    }

    // Check: Minimum qualifying amount
    const minQualifyingAmount = Number(settings.min_order_value_kes || 300);
    const totalPaid = Number(order.total || 0) + Number(order.discount_amount || 0);

    if (totalPaid < minQualifyingAmount) {
      await client.query(
        `UPDATE referrals SET status = 'voided', void_reason = 'Order below minimum qualifying amount', updated_at = NOW() WHERE id = $1`,
        [referral.id]
      );
      await client.query("COMMIT");
      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        reason: "Below minimum qualifying amount",
      };
    }

    // Additional Fraud Checks on Qualification:
    // Payer phone match with referrer?
    let qualificationFraud = false;
    const qualFlagSignals: Record<string, any> = referral.flag_signals || {};

    if (paymentRes.rows.length > 0) {
      const payerJson = paymentRes.rows[0].raw_callback_json;
      const referrerPhoneRes = await client.query(
        `SELECT phone, phone_e164 FROM users WHERE id = $1`,
        [referral.referrer_id]
      );
      const refPhone = referrerPhoneRes.rows[0]?.phone_e164 || referrerPhoneRes.rows[0]?.phone;

      if (refPhone && payerJson && JSON.stringify(payerJson).includes(refPhone.slice(-8))) {
        qualificationFraud = true;
        qualFlagSignals.mpesaPayerMatch = true;
      }
    }

    if (qualificationFraud || referral.status === "flagged") {
      // Keep or mark flagged for admin review
      await client.query(
        `UPDATE referrals 
         SET status = 'flagged', 
             flag_signals = $1::jsonb, 
             flag_reason = 'Fraud check on delivery/payment confirmation',
             delivered_at = NOW(),
             paid_at = NOW(),
             qualifying_order_id = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(qualFlagSignals), orderId, referral.id]
      );

      await client.query("COMMIT");

      broadcastAdminEvent("referral_flagged", {
        referralId: referral.id,
        code: referral.code,
        reason: "Fraud check on qualification",
      });

      return {
        qualified: false,
        awardedReferralPoints: 0,
        awardedLoyaltyPoints,
        newMilestones: [],
        flagged: true,
        reason: "Flagged for fraud review",
      };
    }

    // QUALIFICATION APPROVED:
    // Update referral status to 'qualified'
    await client.query(
      `UPDATE referrals 
       SET status = 'qualified', 
           qualified_at = NOW(),
           delivered_at = NOW(),
           paid_at = NOW(),
           qualifying_order_id = $1,
           referrer_points_awarded = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [orderId, settings.referral_points_per_qualified || 100, referral.id]
    );

    await client.query(
      `INSERT INTO referral_events (referral_id, event_type, notes, meta)
       VALUES ($1, 'qualified', 'Referral qualified upon verified delivery and payment', $2::jsonb)`,
      [referral.id, JSON.stringify({ orderId, triggerSource })]
    );

    // Append +100 Referral Points to points_ledger
    const refEventId = `ref_qual:${referral.id}`;
    const referralPointsToAward = Number(settings.referral_points_per_qualified || 100);

    const curRefBalRes = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger WHERE client_id = $1 AND track = 'referral'`,
      [referral.referrer_id]
    );
    const newRefBal = Number(curRefBalRes.rows[0]?.bal || 0) + referralPointsToAward;

    await client.query(
      `INSERT INTO points_ledger (client_id, track, delta, reason, order_id, referral_id, source_event_id, balance_after)
       VALUES ($1, 'referral', $2, 'REFERRAL_QUALIFIED', $3, $4, $5, $6)
       ON CONFLICT (track, source_event_id) DO NOTHING`,
      [referral.referrer_id, referralPointsToAward, orderId, referral.id, refEventId, newRefBal]
    );

    // Update referrer cached counters
    await client.query(
      `UPDATE users 
       SET referral_points = $1, 
           referral_count = (SELECT count(*)::int FROM referrals WHERE referrer_id = $2 AND status = 'qualified')
       WHERE id = $2`,
      [newRefBal, referral.referrer_id]
    );

    // 6. CHECK MILESTONES (Cumulative Referral Points)
    // 500 points (5 qualified referrals) = Standard reward
    // 1,000 points (10 qualified referrals) = Exclusive reward
    const cumulativePointsRes = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int as total_pts 
       FROM points_ledger 
       WHERE client_id = $1 AND track = 'referral' AND delta > 0`,
      [referral.referrer_id]
    );
    const cumulativePoints = Number(cumulativePointsRes.rows[0]?.total_pts || 0);

    const newMilestones: Array<{ key: string; index: number; points: number }> = [];

    // Check Standard (500 pts)
    const standardIndex = Math.floor(cumulativePoints / 500);
    if (standardIndex > 0) {
      for (let i = 1; i <= standardIndex; i++) {
        const entRes = await client.query(
          `SELECT id FROM reward_entitlements 
           WHERE client_id = $1 AND milestone_key = 'standard_500' AND milestone_index = $2`,
          [referral.referrer_id, i]
        );

        if (entRes.rows.length === 0) {
          const [newEnt] = (
            await client.query(
              `INSERT INTO reward_entitlements (client_id, milestone_key, milestone_index, points_snapshot, status)
               VALUES ($1, 'standard_500', $2, 500, 'pending_approval')
               ON CONFLICT (client_id, milestone_key, milestone_index) DO NOTHING
               RETURNING *`,
              [referral.referrer_id, i]
            )
          ).rows;

          if (newEnt) {
            newMilestones.push({ key: "standard_500", index: i, points: 500 });
          }
        }
      }
    }

    // Check Exclusive (1000 pts)
    const exclusiveIndex = Math.floor(cumulativePoints / 1000);
    if (exclusiveIndex > 0) {
      for (let i = 1; i <= exclusiveIndex; i++) {
        const entRes = await client.query(
          `SELECT id FROM reward_entitlements 
           WHERE client_id = $1 AND milestone_key = 'exclusive_1000' AND milestone_index = $2`,
          [referral.referrer_id, i]
        );

        if (entRes.rows.length === 0) {
          const [newEnt] = (
            await client.query(
              `INSERT INTO reward_entitlements (client_id, milestone_key, milestone_index, points_snapshot, status)
               VALUES ($1, 'exclusive_1000', $2, 1000, 'pending_approval')
               ON CONFLICT (client_id, milestone_key, milestone_index) DO NOTHING
               RETURNING *`,
              [referral.referrer_id, i]
            )
          ).rows;

          if (newEnt) {
            newMilestones.push({ key: "exclusive_1000", index: i, points: 1000 });
          }
        }
      }
    }

    // Commit Transaction
    await client.query("COMMIT");

    // Notifications & SSE (Outside Transaction)
    // 1. Notify Referrer
    await db.insert(notifications).values({
      userId: referral.referrer_id,
      type: "referral_qualified",
      channel: "app",
      status: "SENT",
      title: "Referral Qualified! (+100 pts) 🎉",
      message: `Your friend completed their first wash! You earned +100 referral points.`,
      link: "/client/rewards",
    });

    sendClientEvent(referral.referrer_id, "referral_qualified", {
      referralId: referral.id,
      pointsAwarded: referralPointsToAward,
      newBalance: newRefBal,
    });

    // 2. If Milestone reached: Alert Admin via SSE & WhatsApp
    if (newMilestones.length > 0) {
      broadcastAdminEvent("reward_pending_approval", {
        referrerId: referral.referrer_id,
        milestones: newMilestones,
      });

      // Insert in-app alert for admin
      await db.insert(notifications).values({
        type: "admin_reward_pending",
        channel: "app",
        status: "SENT",
        title: "Reward Awaiting Approval 🚨",
        message: `Client reached milestone (${newMilestones.map((m) => m.key).join(", ")}). Step-up review required.`,
        link: "/admin/rewards",
      });
    }

    return {
      qualified: true,
      awardedReferralPoints: referralPointsToAward,
      awardedLoyaltyPoints,
      newMilestones,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Rewards Engine] Qualification evaluation failed:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================================
// 5. REVERSALS & DISPUTE HANDLING
// ============================================================================

export async function revertOrderQualification(orderId: string, reason: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Reverse referral points if order was a qualifying order
    const refRes = await client.query(
      `SELECT id, referrer_id, status FROM referrals WHERE qualifying_order_id = $1 FOR UPDATE`,
      [orderId]
    );

    if (refRes.rows.length > 0) {
      const referral = refRes.rows[0];
      const revEventId = `rev_ref_qual:${referral.id}`;

      // Insert negative points ledger entry
      const curRefBalRes = await client.query(
        `SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger WHERE client_id = $1 AND track = 'referral'`,
        [referral.referrer_id]
      );
      const newRefBal = Math.max(0, Number(curRefBalRes.rows[0]?.bal || 0) - 100);

      await client.query(
        `INSERT INTO points_ledger (client_id, track, delta, reason, order_id, referral_id, source_event_id, balance_after)
         VALUES ($1, 'referral', -100, 'REFERRAL_REVERSED', $2, $3, $4, $5)
         ON CONFLICT (track, source_event_id) DO NOTHING`,
        [referral.referrer_id, orderId, referral.id, revEventId, newRefBal]
      );

      // Mark referral voided
      await client.query(
        `UPDATE referrals SET status = 'voided', void_reason = $1, updated_at = NOW() WHERE id = $2`,
        [`Order reversed: ${reason}`, referral.id]
      );

      // Check entitlements: if pending_approval, mark voided
      await client.query(
        `UPDATE reward_entitlements 
         SET status = 'voided', void_reason = $1, updated_at = NOW() 
         WHERE client_id = $2 AND status = 'pending_approval'`,
        [`Reversed due to qualifying order refund: ${reason}`, referral.referrer_id]
      );

      // If already approved or redeemed: flag for high-priority admin review!
      const activeEnts = await client.query(
        `SELECT id, status FROM reward_entitlements WHERE client_id = $1 AND status IN ('approved', 'redeemed')`,
        [referral.referrer_id]
      );

      if (activeEnts.rows.length > 0) {
        broadcastAdminEvent("reward_dispute_flag", {
          referrerId: referral.referrer_id,
          reason: `Qualifying order ${orderId} refunded, but reward was already ${activeEnts.rows[0].status}`,
        });
      }
    }

    // 2. Reverse loyalty points
    const loyaltyEventId = `order_loyalty:${orderId}`;
    const hasLoyalty = await client.query(
      `SELECT client_id, delta FROM points_ledger WHERE track = 'loyalty' AND source_event_id = $1`,
      [loyaltyEventId]
    );

    if (hasLoyalty.rows.length > 0) {
      const clientId = hasLoyalty.rows[0].client_id;
      const revLoyaltyEventId = `rev_order_loyalty:${orderId}`;

      const curLoyaltyBalRes = await client.query(
        `SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger WHERE client_id = $1 AND track = 'loyalty'`,
        [clientId]
      );
      const newLoyaltyBal = Math.max(0, Number(curLoyaltyBalRes.rows[0]?.bal || 0) - 10);

      await client.query(
        `INSERT INTO points_ledger (client_id, track, delta, reason, order_id, source_event_id, balance_after)
         VALUES ($1, 'loyalty', -10, 'LOYALTY_REVERSED', $2, NULL, $3, $4)
         ON CONFLICT (track, source_event_id) DO NOTHING`,
        [clientId, orderId, revLoyaltyEventId, newLoyaltyBal]
      );

      await client.query(
        `UPDATE users SET loyalty_points = $1 WHERE id = $2`,
        [newLoyaltyBal, clientId]
      );
    }

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Rewards Engine] Reversal failed:", err);
    return false;
  } finally {
    client.release();
  }
}

// ============================================================================
// 6. ADMIN REWARD APPROVAL & VOUCHER GENERATION
// ============================================================================

export async function approveRewardEntitlement(params: {
  entitlementId: string;
  adminUserId: string;
  adminUsername: string;
  ipHash: string;
  userAgent?: string;
  stepUpMethod: "password" | "totp";
}): Promise<{ success: boolean; voucherId?: string; voucherCode?: string; error?: string }> {
  const { entitlementId, adminUserId, adminUsername, ipHash, userAgent, stepUpMethod } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch entitlement with lock
    const entRes = await client.query(
      `SELECT * FROM reward_entitlements WHERE id = $1 FOR UPDATE`,
      [entitlementId]
    );

    if (entRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "Entitlement not found" };
    }

    const entitlement = entRes.rows[0];

    if (entitlement.status !== "pending_approval" && entitlement.status !== "earned") {
      await client.query("ROLLBACK");
      return { success: false, error: `Cannot approve reward in status '${entitlement.status}'` };
    }

    // Fetch active settings to determine eligible items and max value
    const settingsRes = await client.query(
      `SELECT * FROM program_settings ORDER BY version DESC LIMIT 1`
    );
    const settings = settingsRes.rows[0] || {};

    const isExclusive = entitlement.milestone_key === "exclusive_1000";
    const maxDiscountKes = isExclusive
      ? Number(settings.exclusive_reward_max_cap_kes || 450)
      : Number(settings.standard_reward_max_cap_kes || 300);

    const eligibleItemIds = isExclusive
      ? settings.exclusive_reward_eligible_item_ids || []
      : settings.standard_reward_eligible_item_ids || [];

    const validityDays = Number(settings.voucher_validity_days || 90);
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    // Generate opaque unguessable voucher code
    const voucherCode = `WF-${isExclusive ? "EXCL" : "STD"}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // 1. Create voucher
    const voucherRes = await client.query(
      `INSERT INTO vouchers (
        client_id, entitlement_id, code, source, status, cap_definition, eligible_item_ids, max_discount_kes, expires_at
      ) VALUES ($1, $2, $3, 'referral', 'available', $4, $5::jsonb, $6, $7)
      RETURNING id, code`,
      [
        entitlement.client_id,
        entitlement.id,
        voucherCode,
        isExclusive ? "large_basket" : "standard_choice",
        JSON.stringify(eligibleItemIds),
        maxDiscountKes,
        expiresAt,
      ]
    );

    const newVoucher = voucherRes.rows[0];

    // 2. Update entitlement
    await client.query(
      `UPDATE reward_entitlements 
       SET status = 'approved', 
           voucher_id = $1, 
           approved_by = $2, 
           approved_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $3`,
      [newVoucher.id, adminUserId, entitlementId]
    );

    // 3. Immutable program audit log
    await client.query(
      `INSERT INTO program_audit_log (
        actor_id, action, entity, entity_id, previous_state, new_state, step_up_method, ip_hash, user_agent
      ) VALUES ($1, 'REWARD_APPROVED', 'reward_entitlements', $2, $3::jsonb, $4::jsonb, $5, $6, $7)`,
      [
        adminUserId,
        entitlementId,
        JSON.stringify({ status: entitlement.status }),
        JSON.stringify({ status: "approved", voucherId: newVoucher.id, voucherCode }),
        stepUpMethod,
        ipHash,
        userAgent || null,
      ]
    );

    await client.query("COMMIT");

    // Client In-App Notification
    await db.insert(notifications).values({
      userId: entitlement.client_id,
      type: "reward_approved",
      channel: "app",
      status: "SENT",
      title: "Free Wash Reward Approved! 🧺✨",
      message: `Your ${isExclusive ? "Exclusive" : "Standard"} reward voucher (${voucherCode}) is ready. Apply it on your next booking!`,
      link: "/client/rewards",
    });

    sendClientEvent(entitlement.client_id, "voucher_issued", {
      voucherCode,
      maxDiscountKes,
      expiresAt,
    });

    broadcastAdminEvent("reward_status_changed", {
      entitlementId,
      status: "approved",
      voucherCode,
    });

    return { success: true, voucherId: newVoucher.id, voucherCode };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Rewards Engine] Reward approval failed:", err);
    return { success: false, error: "Database error during reward approval" };
  } finally {
    client.release();
  }
}

// ============================================================================
// 7. ATOMIC VOUCHER REDEMPTION
// ============================================================================

export async function redeemVoucherAtomic(params: {
  voucherId: string;
  clientId: string;
  orderId: string;
  orderSubtotal: number;
  catalogItemIds: string[];
}): Promise<{ success: boolean; discountAmount: number; error?: string }> {
  const { voucherId, clientId, orderId, orderSubtotal, catalogItemIds } = params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Atomically update voucher to 'redeemed'
    // 50 parallel attempts will yield exactly one success!
    const res = await client.query(
      `UPDATE vouchers 
       SET status = 'redeemed', 
           redeemed_order_id = $1, 
           redeemed_at = NOW(), 
           updated_at = NOW() 
       WHERE id = $2 
         AND client_id = $3 
         AND status IN ('available', 'approved', 'reserved') 
         AND expires_at > NOW() 
       RETURNING id, code, max_discount_kes, eligible_item_ids`,
      [orderId, voucherId, clientId]
    );

    if (res.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, discountAmount: 0, error: "Voucher is invalid, expired, or already redeemed." };
    }

    const voucher = res.rows[0];
    const eligibleItemIds: string[] = voucher.eligible_item_ids || [];

    // Verify item match if eligible item IDs specified
    if (eligibleItemIds.length > 0) {
      const hasMatchingItem = catalogItemIds.some((id) => eligibleItemIds.includes(id));
      if (!hasMatchingItem) {
        await client.query("ROLLBACK");
        return {
          success: false,
          discountAmount: 0,
          error: "Selected order items do not match the eligible items for this reward voucher.",
        };
      }
    }

    // Compute discount amount (capped at maxDiscountKes and orderSubtotal)
    const discountAmount = Math.min(orderSubtotal, Number(voucher.max_discount_kes || 300));

    await client.query("COMMIT");
    return { success: true, discountAmount };
  } catch (err) {
    await client.query("ROLLBACK");
    return { success: false, discountAmount: 0, error: "Voucher redemption failed" };
  } finally {
    client.release();
  }
}

// ============================================================================
// 8. SCHEDULED RECONCILIATION JOB
// ============================================================================

export async function reconcilePointsLedger(): Promise<{
  clientsChecked: number;
  driftsDetected: number;
  drifts: Array<{ clientId: string; track: string; cached: number; actual: number }>;
}> {
  const clients = await db.query.users.findMany({
    columns: { id: true, referralPoints: true, loyaltyPoints: true },
  });

  const drifts: Array<{ clientId: string; track: string; cached: number; actual: number }> = [];

  for (const c of clients) {
    const [refActual] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger 
        WHERE client_id = ${c.id} AND track = 'referral'
      `)
    ).rows as any[];

    const [loyaltyActual] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as bal FROM points_ledger 
        WHERE client_id = ${c.id} AND track = 'loyalty'
      `)
    ).rows as any[];

    const actualRef = Number(refActual?.bal || 0);
    const actualLoyalty = Number(loyaltyActual?.bal || 0);

    if (actualRef !== c.referralPoints) {
      drifts.push({ clientId: c.id, track: "referral", cached: c.referralPoints, actual: actualRef });
      await db.update(users).set({ referralPoints: actualRef }).where(eq(users.id, c.id));
    }

    if (actualLoyalty !== c.loyaltyPoints) {
      drifts.push({ clientId: c.id, track: "loyalty", cached: c.loyaltyPoints, actual: actualLoyalty });
      await db.update(users).set({ loyaltyPoints: actualLoyalty }).where(eq(users.id, c.id));
    }
  }

  if (drifts.length > 0) {
    broadcastAdminEvent("reconciliation_drift_detected", { drifts });
  }

  return {
    clientsChecked: clients.length,
    driftsDetected: drifts.length,
    drifts,
  };
}

// ============================================================================
// 9. BACKWARDS-COMPATIBLE ADAPTERS
// ============================================================================

export const REFERRAL_BONUS_POINTS = 100;
export const FREE_WASH_THRESHOLD_POINTS = 500;
export const ORDER_COMPLETED_POINTS = 10;
export const REVIEW_COMMENT_POINTS = 0;

export async function awardReviewCommentPoints(
  _bookingId: string,
  _userId: string,
  _comment?: string | null
): Promise<boolean> {
  // Review comments do not award points in new spec; points are earned strictly on verified paid delivery
  return true;
}

export async function completeReferralIfPending(
  _refereeUserId: string,
  _bookingId: string
): Promise<{ completed: boolean; pointsAwarded?: number }> {
  // Referrals qualify strictly on delivered + verified M-Pesa payment, not on booking creation
  return { completed: false };
}

export async function awardOrderDeliveryPoints(bookingId: string): Promise<boolean> {
  const res = await evaluateOrderQualification(bookingId, "status_delivered");
  return res.qualified || res.awardedLoyaltyPoints > 0;
}

export async function registerReferralOnSignup(
  refereeUserId: string,
  rawCode?: string
): Promise<{ success: boolean; message?: string }> {
  return attributeReferralOnSignup({ refereeUserId, rawCode });
}

export async function redeemFreeWash(
  _userId: string
): Promise<{ success: boolean; voucherCode?: string; error?: string }> {
  return {
    success: false,
    error: "Reward vouchers are granted automatically upon milestone admin approval. Please check your Rewards Wallet.",
  };
}

