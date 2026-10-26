import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../src/db";
import {
  users,
  referralCodes,
  referrals,
  pointsLedger,
  rewardEntitlements,
  vouchers,
  bookings,
  addresses,
  priceCatalog,
  payments,
  programSettings,
  programAuditLog,
} from "../src/db/schema";
import {
  generateCsprngCode,
  signAttributionCookie,
  verifyAttributionCookie,
  attributeReferralOnSignup,
  evaluateOrderQualification,
  revertOrderQualification,
  approveRewardEntitlement,
  redeemVoucherAtomic,
} from "../src/lib/rewards";
import { eq, or, and, sql } from "drizzle-orm";

describe("WashFlow Referrals & Loyalty V2 Enterprise Program Test Suite", () => {
  const referrerPhone = "+254700000101";
  const refereePhone1 = "+254700000102";
  const refereePhone2 = "+254700000103";
  const adminPhone = "+254706351077";

  let adminUserId: string;
  let referrerUserId: string;
  let refereeUser1Id: string;
  let refereeUser2Id: string;
  let referrerCode: string;

  let testCatalogItem1: string;
  let testAddressId: string;

  beforeAll(async () => {
    // 1. Cleanup any previous test data
    const testPhones = [referrerPhone, refereePhone1, refereePhone2, "+254700000999"];
    for (const p of testPhones) {
      const existing = await db.query.users.findFirst({ where: eq(users.phone, p) });
      if (existing) {
        await db.delete(vouchers).where(eq(vouchers.clientId, existing.id));
        await db.delete(rewardEntitlements).where(eq(rewardEntitlements.clientId, existing.id));
        await db.delete(pointsLedger).where(eq(pointsLedger.clientId, existing.id));
        await db.delete(referrals).where(or(eq(referrals.referrerId, existing.id), eq(referrals.referredUserId, existing.id)));
        await db.delete(bookings).where(eq(bookings.customerId, existing.id));
        await db.delete(referralCodes).where(eq(referralCodes.userId, existing.id));
        await db.delete(users).where(eq(users.id, existing.id));
      }
    }

    // 2. Fetch or create Admin
    let admin = await db.query.users.findFirst({ where: eq(users.role, "admin") });
    if (!admin) {
      const [newAdmin] = await db
        .insert(users)
        .values({
          name: "Test Admin",
          username: "admin_test_" + Date.now(),
          phone: adminPhone,
          phoneE164: adminPhone,
          role: "admin",
          passwordHash: "argon2_test_hash",
        })
        .returning();
      admin = newAdmin;
    }
    adminUserId = admin.id;

    // 3. Ensure test catalog item
    const catalogItem = await db.query.priceCatalog.findFirst({
      where: eq(priceCatalog.active, true),
    });
    if (catalogItem) {
      testCatalogItem1 = catalogItem.id;
    } else {
      const [newCat] = await db
        .insert(priceCatalog)
        .values({
          category: "Basket Wash",
          name: "Small Basket Wash & Fold",
          variant: "Small Basket, up to 7 kg",
          basePrice: 300,
          active: true,
        })
        .returning();
      testCatalogItem1 = newCat.id;
    }

    // 4. Create Referrer
    referrerCode = generateCsprngCode();
    const [referrer] = await db
      .insert(users)
      .values({
        name: "Referrer Test Client",
        username: "ref_client_" + Date.now(),
        phone: referrerPhone,
        phoneE164: referrerPhone,
        role: "user",
        referralCode: referrerCode,
      })
      .returning();
    referrerUserId = referrer.id;

    await db.insert(referralCodes).values({
      userId: referrerUserId,
      code: referrerCode,
      active: true,
    });

    // Create an address for referrer
    const [addr] = await db
      .insert(addresses)
      .values({
        userId: referrerUserId,
        label: "Home",
        addressText: "Kileleshwa, Nairobi",
        latitude: -1.2833,
        longitude: 36.8167,
      })
      .returning();
    testAddressId = addr.id;

    // 5. Ensure Program Settings exist
    const settings = await db.query.programSettings.findFirst();
    if (!settings) {
      await db.insert(programSettings).values({
        version: 1,
        programActive: true,
        standardRewardMilestonePoints: 500,
        exclusiveRewardMilestonePoints: 1000,
        standardRewardMaxCapKes: 300,
        exclusiveRewardMaxCapKes: 450,
        loyaltyPointsPerPaidOrder: 10,
        loyaltyRedemptionPoints: 100,
        minOrderValueKes: 300,
        voucherValidityDays: 90,
        annualRewardCap: 15,
        holdWindowHours: 0,
        requireAdminApproval: true,
        autoApproveLowRisk: false,
        adminAlertPhone: adminPhone,
      });
    }
  });

  afterAll(async () => {
    // Teardown test users
    const testIds = [referrerUserId, refereeUser1Id, refereeUser2Id].filter(Boolean);
    for (const uid of testIds) {
      await db.delete(vouchers).where(eq(vouchers.clientId, uid));
      await db.delete(rewardEntitlements).where(eq(rewardEntitlements.clientId, uid));
      await db.delete(pointsLedger).where(eq(pointsLedger.clientId, uid));
      await db.delete(referrals).where(or(eq(referrals.referrerId, uid), eq(referrals.referredUserId, uid)));
      await db.delete(bookings).where(eq(bookings.customerId, uid));
      await db.delete(referralCodes).where(eq(referralCodes.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
  });

  // ==========================================================================
  // Test 1: CSPRNG Code Generation & Signed Cookie Tamper Proofing
  // ==========================================================================
  it("generates unguessable CSPRNG codes and tamper-proof HMAC signatures", () => {
    const code1 = generateCsprngCode();
    const code2 = generateCsprngCode();

    expect(code1).toMatch(/^WF-[A-Z0-9]{6}$/);
    expect(code2).toMatch(/^WF-[A-Z0-9]{6}$/);
    expect(code1).not.toBe(code2);

    // Sign attribution cookie
    const signed = signAttributionCookie(code1);
    expect(verifyAttributionCookie(signed)).toBe(code1);

    // Tampered cookie must be rejected
    const tampered = signed.replace("WF-", "WF-FAKE");
    expect(verifyAttributionCookie(tampered)).toBeNull();
  });

  // ==========================================================================
  // Test 2: Fraud Checks (Self-Referral & Phone Collision Hard-Rejection)
  // ==========================================================================
  it("rejects self-referral and matching phone numbers", async () => {
    // Attempt self-referral
    const selfRefRes = await attributeReferralOnSignup({
      refereeUserId: referrerUserId,
      refereePhoneE164: referrerPhone,
      rawCode: referrerCode,
      attributionSource: "manual_code",
    });
    expect(selfRefRes.attributed).toBe(false);
    expect(selfRefRes.reason).toBe("Self-referral prohibited");

    // Create referee with matching referrer phone
    const [fakeUser] = await db
      .insert(users)
      .values({
        name: "Duplicate Phone Client",
        username: "dup_" + Date.now(),
        phone: referrerPhone, // Collision!
        phoneE164: referrerPhone,
        role: "user",
      })
      .returning();

    const dupRes = await attributeReferralOnSignup({
      refereeUserId: fakeUser.id,
      refereePhoneE164: referrerPhone,
      rawCode: referrerCode,
      attributionSource: "link",
    });
    expect(dupRes.attributed).toBe(false);
    expect(dupRes.reason).toBe("Matching phone number");

    // Clean up fake user
    await db.delete(users).where(eq(users.id, fakeUser.id));
  });

  // ==========================================================================
  // Test 3: Valid Referral Attribution on Genuine New User Signup
  // ==========================================================================
  it("successfully attributes referral for a genuinely new client in same transaction", async () => {
    const [referee1] = await db
      .insert(users)
      .values({
        name: "Referee One",
        username: "referee_1_" + Date.now(),
        phone: refereePhone1,
        phoneE164: refereePhone1,
        role: "user",
        referralCode: generateCsprngCode(),
      })
      .returning();
    refereeUser1Id = referee1.id;

    const attrRes = await attributeReferralOnSignup({
      refereeUserId: refereeUser1Id,
      refereePhoneE164: refereePhone1,
      rawCode: referrerCode,
      attributionSource: "link",
    });

    expect(attrRes.attributed).toBe(true);
    expect(attrRes.referralId).toBeDefined();

    // Verify referral record in database
    const refRecord = await db.query.referrals.findFirst({
      where: eq(referrals.id, attrRes.referralId!),
    });
    expect(refRecord).toBeDefined();
    expect(refRecord?.referrerId).toBe(referrerUserId);
    expect(refRecord?.referredUserId).toBe(refereeUser1Id);
    expect(refRecord?.status).toBe("signed_up");
  });

  // ==========================================================================
  // Test 4: Order Qualification Pipeline (Both Event Arrivals & Idempotency)
  // ==========================================================================
  it("qualifies referral only when both DELIVERED and PAID events occur (order independent)", async () => {
    // 1. Create referee's first booking
    const [booking1] = await db
      .insert(bookings)
      .values({
        customerId: refereeUser1Id,
        addressId: testAddressId,
        total: 500,
        subtotal: 500,
        status: "CONFIRMED",
        paymentStatus: "PENDING",
        serviceType: "Wash & Fold",
      })
      .returning();

    // Create payment record
    await db.insert(payments).values({
      bookingId: booking1.id,
      amount: 500,
      currency: "KES",
      status: "PENDING",
      method: "MPESA",
    });

    // A. Payment confirmed first while status is still CONFIRMED (not yet DELIVERED)
    await db
      .update(bookings)
      .set({ paymentStatus: "PAID" })
      .where(eq(bookings.id, booking1.id));
    await db
      .update(payments)
      .set({ status: "SUCCESS" })
      .where(eq(payments.bookingId, booking1.id));

    const qualRes1 = await evaluateOrderQualification(booking1.id, "payment_confirmed");
    // Not yet qualified because not yet DELIVERED
    expect(qualRes1.qualified).toBe(false);

    // B. Order delivered event arrives
    await db
      .update(bookings)
      .set({ status: "DELIVERED" })
      .where(eq(bookings.id, booking1.id));

    const qualRes2 = await evaluateOrderQualification(booking1.id, "status_delivered");
    // NOW qualified!
    expect(qualRes2.qualified).toBe(true);

    // Verify Referrer received exactly +100 referral points
    const [refLedger] = await db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.clientId, referrerUserId),
          eq(pointsLedger.track, "referral")
        )
      );
    expect(refLedger).toBeDefined();
    expect(refLedger.delta).toBe(100);

    // Verify Referee received +10 loyalty points
    const [loyaltyLedger] = await db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.clientId, refereeUser1Id),
          eq(pointsLedger.track, "loyalty")
        )
      );
    expect(loyaltyLedger).toBeDefined();
    expect(loyaltyLedger.delta).toBe(10);

    // C. Replayed/duplicate event arrival must be strictly idempotent
    const duplicateRes = await evaluateOrderQualification(booking1.id, "status_delivered");
    expect(duplicateRes.qualified).toBe(false);

    const allRefLedgerEntries = await db
      .select()
      .from(pointsLedger)
      .where(
        and(
          eq(pointsLedger.clientId, referrerUserId),
          eq(pointsLedger.track, "referral")
        )
      );
    // Unique constraint UNIQUE(track, source_event_id) prevents duplicate points
    expect(allRefLedgerEntries.length).toBe(1);
  });

  // ==========================================================================
  // Test 5: Reversals on Order Cancellation or Dispute
  // ==========================================================================
  it("reverses points upon order cancellation or refund", async () => {
    // Fetch current referrer balance
    const [balBefore] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as b FROM points_ledger 
        WHERE client_id = ${referrerUserId} AND track = 'referral'
      `)
    ).rows as any[];
    expect(Number(balBefore.b)).toBe(100);

    // Get the qualified booking
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.customerId, refereeUser1Id),
    });
    expect(booking).toBeDefined();

    // Cancel / refund order
    await revertOrderQualification(booking!.id, "Customer refund requested");

    // Balance must be 0 after -100 reversal ledger entry
    const [balAfter] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as b FROM points_ledger 
        WHERE client_id = ${referrerUserId} AND track = 'referral'
      `)
    ).rows as any[];
    expect(Number(balAfter.b)).toBe(0);

    // Verify negative delta in points_ledger
    const revEntry = await db.query.pointsLedger.findFirst({
      where: and(
        eq(pointsLedger.clientId, referrerUserId),
        eq(pointsLedger.delta, -100)
      ),
    });
    expect(revEntry).toBeDefined();
  });

  // ==========================================================================
  // Test 6: Milestone Crossing & Step-Up Admin Approval
  // ==========================================================================
  it("triggers reward entitlement at 500 points and approves voucher via admin step-up", async () => {
    // Direct append 500 referral points to trigger milestone
    await db.insert(pointsLedger).values({
      clientId: referrerUserId,
      track: "referral",
      delta: 500,
      balanceAfter: 500,
      reason: "Milestone test grant",
      sourceEventId: "grant_" + Date.now(),
    });

    // Create a 2nd referee and booking to trigger qualification milestone check
    const [referee2] = await db
      .insert(users)
      .values({
        name: "Referee Two",
        username: "referee_2_" + Date.now(),
        phone: refereePhone2,
        phoneE164: refereePhone2,
        role: "user",
      })
      .returning();
    refereeUser2Id = referee2.id;

    await attributeReferralOnSignup({
      refereeUserId: refereeUser2Id,
      refereePhoneE164: refereePhone2,
      rawCode: referrerCode,
      attributionSource: "link",
    });

    const [booking2] = await db
      .insert(bookings)
      .values({
        customerId: refereeUser2Id,
        addressId: testAddressId,
        total: 600,
        subtotal: 600,
        status: "DELIVERED",
        paymentStatus: "PAID",
      })
      .returning();

    // Qualify
    await evaluateOrderQualification(booking2.id, "status_delivered");

    // Verify exactly ONE reward_entitlements in pending_approval
    const entitlements = await db
      .select()
      .from(rewardEntitlements)
      .where(
        and(
          eq(rewardEntitlements.clientId, referrerUserId),
          eq(rewardEntitlements.milestoneKey, "standard_500")
        )
      );
    expect(entitlements.length).toBe(1);
    const entitlement = entitlements[0];
    expect(entitlement.status).toBe("pending_approval");

    // Admin Step-Up Approval
    const approvalRes = await approveRewardEntitlement({
      entitlementId: entitlement.id,
      adminUserId,
      adminUsername: "admin_test",
      ipHash: "testhash123",
      stepUpMethod: "password",
    });

    expect(approvalRes.success).toBe(true);
    expect(approvalRes.voucherCode).toBeDefined();

    // Verify voucher created
    const createdVoucher = await db.query.vouchers.findFirst({
      where: eq(vouchers.code, approvalRes.voucherCode!),
    });
    expect(createdVoucher).toBeDefined();
    expect(createdVoucher?.status).toBe("available");
    expect(createdVoucher?.maxDiscountKes).toBe(300);

    // Verify immutable audit log was written
    const auditRow = await db.query.programAuditLog.findFirst({
      where: and(
        eq(programAuditLog.entityId, entitlement.id),
        eq(programAuditLog.action, "REWARD_APPROVED")
      ),
    });
    expect(auditRow).toBeDefined();
    expect(auditRow?.actorUserId).toBe(adminUserId);
  });

  // ==========================================================================
  // Test 7: Atomic Voucher Redemption Race Condition (50 Parallel Requests)
  // ==========================================================================
  it("guarantees atomic voucher redemption where 50 concurrent requests yield exactly 1 success", async () => {
    // 1. Create a fresh available voucher
    const testVoucherCode = "WF-RACE-" + Math.floor(Math.random() * 1000000);
    const [voucher] = await db
      .insert(vouchers)
      .values({
        clientId: referrerUserId,
        code: testVoucherCode,
        source: "referral_milestone",
        status: "available",
        maxDiscountKes: 300,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning();

    // 2. Launch 50 concurrent redemption attempts simultaneously
    const attempts = Array.from({ length: 50 }, (_, i) => {
      const mockOrderId = `test_order_${i}_${Date.now()}`;
      return redeemVoucherAtomic({
        voucherId: voucher.id,
        clientId: referrerUserId,
        orderId: mockOrderId,
      });
    });

    const results = await Promise.all(attempts);

    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    // Exactly 1 redemption succeeds! 49 fail!
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(49);

    // Verify final voucher state is 'redeemed'
    const finalVoucher = await db.query.vouchers.findFirst({
      where: eq(vouchers.id, voucher.id),
    });
    expect(finalVoucher?.status).toBe("redeemed");
  });
});
